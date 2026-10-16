#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALUE_FLAGS = new Set(["size", "id", "task"]);
const SIZES = ["S", "M", "L"];
const STALE_MS = 2 * 60 * 60 * 1000;
const HEDGE =
	/\b(should|probably|likely|seems?|seemingly|i think|i believe|i assume|presumably|in theory|might|hopefully|looks (good|fine|correct|right))\b/i;

const out = (s = "") => process.stdout.write(`${s}\n`);
class Exit extends Error {}
function die(msg, code = 1) {
	process.stderr.write(`${msg}\n`);
	process.exitCode = code;
	throw new Exit();
}

function git(args, cwd = ROOT) {
	const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 << 20 });
	return r.status === 0 ? r.stdout.replace(/\n$/, "") : null;
}

const ROOT = git(["rev-parse", "--show-toplevel"], process.cwd()) ?? process.cwd();
const COMMON = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
const STORE = COMMON ? path.join(COMMON, "vstack") : path.join(ROOT, ".vstack", "state");
const TASKS = path.join(STORE, "tasks");

const readJSON = (f) => {
	try {
		return JSON.parse(fs.readFileSync(f, "utf8"));
	} catch {
		return null;
	}
};
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const firstExisting = (paths) => paths.find((p) => fs.existsSync(p));

function writeAtomic(file, data) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, data);
	fs.renameSync(tmp, file);
}

function parseArgs(args) {
	const flags = {};
	const pos = [];
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === "--") {
			pos.push(...args.slice(i + 1));
			break;
		}
		if (a.startsWith("--")) {
			const [k, v] = a.slice(2).split(/=(.*)/s);
			if (v !== undefined) flags[k] = v;
			else if (VALUE_FLAGS.has(k) && args[i + 1] !== undefined) flags[k] = args[++i];
			else flags[k] = true;
		} else pos.push(a);
	}
	return { flags, pos };
}

// ---------- config ----------

function detectChecks() {
	const checks = {};
	const pj = readJSON(path.join(ROOT, "package.json"));
	if (pj?.scripts) {
		const pm = exists("pnpm-lock.yaml")
			? "pnpm"
			: exists("yarn.lock")
				? "yarn"
				: exists("bun.lock") || exists("bun.lockb")
					? "bun"
					: "npm";
		const s = pj.scripts;
		if (s.test && !/no test specified/.test(s.test)) checks.test = `${pm} run test`;
		const types = ["typecheck", "type-check", "check-types", "types", "tsc"].find((k) => s[k]);
		if (types) checks.types = `${pm} run ${types}`;
		else if (exists("tsconfig.json")) checks.types = pm === "pnpm" ? "pnpm exec tsc --noEmit" : "npx tsc --noEmit";
		if (s.lint) checks.lint = `${pm} run lint`;
	} else if (exists("go.mod")) {
		checks.test = "go test ./...";
		checks.lint = "go vet ./...";
	} else if (exists("Cargo.toml")) {
		checks.test = "cargo test";
		checks.lint = "cargo clippy -- -D warnings";
	} else if (exists("pyproject.toml") || exists("setup.py")) {
		checks.test = "pytest -q";
	}
	return checks;
}

function loadConfig() {
	const file = path.join(ROOT, "vstack.json");
	const cfg = readJSON(file) ?? {};
	if (fs.existsSync(file) && !Object.keys(cfg).length && fs.readFileSync(file, "utf8").trim())
		die(`vstack.json is not valid JSON`);
	return { ...cfg, checks: { ...detectChecks(), ...cfg.checks } };
}

let cfgCache;
const cfg = () => (cfgCache ??= loadConfig());

// ---------- flows ----------

const flowDirs = () => [path.join(ROOT, ".vstack", "flows"), path.join(HERE, "flows"), path.join(HERE, "..", "flows")];

function listFlows() {
	const names = new Set();
	for (const d of flowDirs()) {
		if (!fs.existsSync(d)) continue;
		for (const f of fs.readdirSync(d)) if (f.endsWith(".json")) names.add(f.slice(0, -5));
	}
	return [...names].sort();
}

function loadFlow(name) {
	const file = firstExisting(flowDirs().map((d) => path.join(d, `${name}.json`)));
	if (!file) die(`unknown flow "${name}". flows: ${listFlows().join(", ")}`);
	const flow = readJSON(file);
	if (!flow?.states?.length) die(`flow file ${file} has no states`);
	return flow;
}

function principles(tags) {
	const file = firstExisting([
		path.join(ROOT, ".vstack", "principles.md"),
		path.join(HERE, "principles.md"),
		path.join(HERE, "..", "skills", "vstack", "principles.md"),
	]);
	if (!file || !tags) return [];
	const want = new Set(tags.split(/\s+/));
	return fs
		.readFileSync(file, "utf8")
		.split("\n")
		.map((l) => l.match(/^- \*\*(.+?)\*\* `([^`]+)` - (.+)$/))
		.filter((m) => m && m[2].split(/\s+/).some((t) => want.has(t)))
		.map((m) => `  - ${m[1]}: ${m[3]}`);
}

// ---------- tasks ----------

const taskFile = (id) => path.join(TASKS, `${id}.json`);
const pointerFile = () =>
	path.join(STORE, "current", crypto.createHash("sha1").update(ROOT).digest("hex").slice(0, 12));
const saveTask = (t) => writeAtomic(taskFile(t.id), JSON.stringify({ ...t, updated: Date.now() }, null, "\t"));

function allTasks() {
	if (!fs.existsSync(TASKS)) return [];
	return fs
		.readdirSync(TASKS)
		.filter((f) => f.endsWith(".json"))
		.map((f) => readJSON(path.join(TASKS, f)))
		.filter(Boolean);
}

function currentTask(flags, { required = true } = {}) {
	const id = flags.task || process.env.VSTACK_TASK || readPointer();
	if (id) {
		const t = readJSON(taskFile(id));
		if (t) return t;
		if (flags.task || process.env.VSTACK_TASK) die(`no task "${id}"`);
	}
	const here = allTasks().filter((t) => t.status === "active" && t.worktree === ROOT);
	if (here.length === 1) return here[0];
	if (!required) return null;
	if (here.length > 1) die(`several active tasks here: ${here.map((t) => t.id).join(", ")}. pick one: vstack use <id>`);
	die(`no active task. start one: vstack start <${listFlows().join("|")}> "<goal>" --size S|M|L`);
}

function readPointer() {
	try {
		return fs.readFileSync(pointerFile(), "utf8").trim() || null;
	} catch {
		return null;
	}
}

const slug = (s) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(" ")
		.slice(0, 5)
		.join("-") || "task";

function uniqueId(base) {
	let id = base;
	for (let n = 2; fs.existsSync(taskFile(id)); n++) id = `${base}-${n}`;
	return id;
}

function lastEvidence(t, stateId) {
	return t.history.findLast((h) => h.state === stateId && h.kind === "done")?.text;
}

// ---------- gates ----------

function tail(text, n) {
	const lines = text.trimEnd().split("\n");
	return (lines.length > n ? [`  … ${lines.length - n} lines above`, ...lines.slice(-n)] : lines).join("\n");
}

function runCheck(name) {
	const cmd = cfg().checks[name];
	if (!cmd) {
		out(`- ${name}: not configured (vstack.json "checks")`);
		return true;
	}
	const started = Date.now();
	const r = spawnSync(cmd, {
		shell: true,
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 256 << 20,
		timeout: cfg().timeoutMs ?? 20 * 60 * 1000,
		env: { ...process.env, CI: process.env.CI ?? "1", FORCE_COLOR: "0" },
	});
	const secs = ((Date.now() - started) / 1000).toFixed(1);
	if (r.status === 0) {
		out(`✓ ${name} (${secs}s)`);
		return true;
	}
	out(`✗ ${name} (${secs}s) \`${cmd}\`${r.error ? ` ${r.error.message}` : ""}`);
	out(tail(`${r.stdout ?? ""}${r.stderr ?? ""}`, 40));
	return false;
}

function runGates(names, task) {
	let ok = true;
	for (const n of names) ok = (n === "slop" ? slop(task).fails === 0 : runCheck(n)) && ok;
	return ok;
}

function baseBranch() {
	if (cfg().base) return cfg().base;
	const head = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
	if (head) return head.replace(/^origin\//, "");
	return git(["rev-parse", "--verify", "--quiet", "main"]) !== null ? "main" : "master";
}

function diffBase(task) {
	if (task?.startSha && git(["cat-file", "-e", `${task.startSha}^{commit}`]) !== null) return task.startSha;
	const b = baseBranch();
	return git(["merge-base", "HEAD", b]) ?? git(["merge-base", "HEAD", `origin/${b}`]) ?? "HEAD";
}

function untracked() {
	return (git(["ls-files", "--others", "--exclude-standard"]) ?? "").split("\n").filter(Boolean);
}

function readText(rel) {
	try {
		const buf = fs.readFileSync(path.join(ROOT, rel));
		if (buf.length > 1 << 20 || buf.subarray(0, 8000).includes(0)) return null;
		return buf.toString("utf8");
	} catch {
		return null;
	}
}

function fingerprint(task) {
	const h = crypto.createHash("sha1").update(git(["diff", "--binary", diffBase(task)]) ?? "");
	for (const f of untracked()) h.update(f).update(readText(f) ?? "");
	return h.digest("hex");
}

function addedLines(base) {
	const lines = [];
	let file = null;
	let ln = 0;
	let header = false;
	for (const line of (git(["diff", "--unified=0", "--no-color", "--no-ext-diff", base]) ?? "").split("\n")) {
		if (line.startsWith("diff --git ")) {
			header = true;
			file = null;
			continue;
		}
		if (header) {
			if (line.startsWith("+++ ")) file = line === "+++ /dev/null" ? null : line.slice(4).replace(/^b\//, "");
			const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
			if (h) {
				header = false;
				ln = Number(h[1]);
			}
			continue;
		}
		const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
		if (h) ln = Number(h[1]);
		else if (file && line.startsWith("+")) lines.push({ file, line: ln++, text: line.slice(1) });
	}
	for (const f of untracked()) {
		const text = readText(f);
		if (text !== null) text.split("\n").forEach((t, i) => lines.push({ file: f, line: i + 1, text: t }));
	}
	return lines;
}

const CODE = /\.(m?[jt]sx?|cjs|cts|mts|py|go|rs|rb|java|kt|swift|php|cs|vue|svelte|dart|scala|c|cc|cpp|h|hpp|sh)$/;
const TS = /\.([cm]?tsx?|vue|svelte)$/;
const HASH_COMMENT = /\.(py|rb|sh)$/;
const TEST_FILE = /(^|\/)(__tests__|tests?|spec)\/|[._-](test|spec)\.[^/]+$/;
const NARRATION =
	"(Step|Phase)\\s*\\d|(Add|Adds|Adding|Update|Updates|Updating|Create|Creates|Creating|Handle|Handles|Handling|Set|Sets|Setting|Get|Gets|Getting|Call|Calls|Calling|Import|Imports|Initialize|Initializes|Check|Checks|Checking|Return|Returns|Define|Defines|Loop|Loops|Increment|Increments|Render|Renders|Fetch|Fetches)\\b";
const CODE_START = "(const|let|var|if|for|while|return|import|export|function|await|def|class)\\b.*[;{(=)]\\s*$";

const RULES = [
	{
		id: "type-escape",
		fail: true,
		warnInTests: true,
		only: TS,
		re: /\bas any\b|:\s*any\b|<any>|@ts-ignore|@ts-nocheck/,
		msg: "type escape hatch. Model the type",
	},
	{
		id: "suppressed-check",
		fail: true,
		re: /eslint-disable|biome-ignore|#\s*noqa|#\s*type:\s*ignore|#\[allow\(|\/\/\s*nolint/,
		msg: "suppressed lint or type check",
	},
	{
		id: "swallowed-error",
		fail: true,
		re: /catch\s*(\([^)]*\))?\s*\{\s*\}|except(\s+[\w.]+)?(\s+as\s+\w+)?\s*:\s*pass\b|\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(\{\s*\}|null|undefined)\s*\)/,
		msg: "error swallowed. Handle it or let it propagate",
	},
	{ id: "debugger", fail: true, re: /^\s*debugger;?\s*$|\bbinding\.pry\b|^\s*breakpoint\(\)/, msg: "debugger left in" },
	{
		id: "debug-output",
		re: /\bconsole\.(log|debug)\(|^\s*print\(|\bfmt\.Print(ln|f)?\(|\bdbg!\(/,
		msg: "debug output. Remove it or use the project logger",
	},
	{ id: "todo", re: /\b(TODO|FIXME|XXX|HACK)\b/, msg: "unfinished marker. Finish it or track it outside the code" },
	{
		id: "narrating-comment",
		re: (f) => new RegExp(`^\\s*(${HASH_COMMENT.test(f) ? "#" : "//|/\\*+|\\*"})\\s*(${NARRATION})`),
		msg: "comment narrates the code. Keep only a non-obvious why",
	},
	{
		id: "commented-code",
		re: (f) => new RegExp(`^\\s*(${HASH_COMMENT.test(f) ? "#" : "//"})\\s*${CODE_START}`),
		msg: "commented-out code. Delete it, git remembers",
	},
];

function globToRe(glob) {
	const re = glob
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*\/?/g, "\u0000")
		.replace(/\*/g, "[^/]*")
		.replace(/\?/g, "[^/]")
		.replace(/\u0000/g, ".*");
	return new RegExp(`^${re}$`);
}

function slop(task, { quiet = false } = {}) {
	const conf = cfg().slop ?? {};
	const off = new Set(conf.off ?? []);
	const ignore = (conf.ignore ?? []).map(globToRe);
	const base = diffBase(task);
	const added = addedLines(base);
	const findings = [];
	for (const a of added) {
		if (!CODE.test(a.file) || ignore.some((r) => r.test(a.file)) || a.text.includes("vstack-ok")) continue;
		for (const r of RULES) {
			if (off.has(r.id) || (r.only && !r.only.test(a.file))) continue;
			const re = typeof r.re === "function" ? r.re(a.file) : r.re;
			if (!re.test(a.text)) continue;
			const fail = r.fail && !(r.warnInTests && TEST_FILE.test(a.file));
			findings.push({ ...a, rule: { ...r, fail } });
		}
	}
	const budget = { S: 200, M: 800, ...conf.budget }[task?.size ?? "M"];
	const fails = findings.filter((f) => f.rule.fail).length;
	if (quiet) return { fails, findings };
	const short = base.length === 40 ? base.slice(0, 8) : base;
	out(
		`${fails ? "✗" : "✓"} slop: ${fails} fail, ${findings.length - fails} warn, ${added.length} added lines since ${short}`,
	);
	if (budget && added.length > budget)
		out(`  ⚠ diff is over the size-${task?.size ?? "M"} budget of ${budget} lines. Split it or resize the task`);
	findings
		.sort((a, b) => b.rule.fail - a.rule.fail)
		.slice(0, 30)
		.forEach((f) => out(`  ${f.rule.fail ? "✗" : "⚠"} ${f.file}:${f.line} ${f.rule.id}: ${f.rule.msg}\n      ${f.text.trim().slice(0, 140)}`));
	if (findings.length > 30) out(`  … ${findings.length - 30} more`);
	if (findings.length) out(`  intentional? append "vstack-ok" to the line, or set slop.off / slop.ignore in vstack.json`);
	return { fails, findings };
}

// ---------- step rendering ----------

const activeStates = (flow, size) => flow.states.filter((s) => !s.sizes || s.sizes.includes(size));

function printStep(t) {
	const flow = loadFlow(t.flow);
	if (t.status !== "active") {
		out(`[${t.flow}] ${t.id} is ${t.status}.`);
		return;
	}
	const st = flow.states[t.state];
	const visible = activeStates(flow, t.size);
	const n = visible.indexOf(st) + 1;
	out(`[${t.flow} ${n}/${visible.length}] ${st.id} · ${t.id} (${t.size})`);
	out(st.do);
	const p = principles(st.principles);
	if (p.length) out(`Principles:\n${p.join("\n")}`);
	out(`Exit evidence: ${st.exit}`);
	if (st.run?.length) out(`Gates on done: ${st.run.join(", ")}`);
	out(`→ vstack done "<evidence>"${st.must ? "" : `  |  vstack skip "<reason>"`}`);
}

function advance(t, flow) {
	for (let i = t.state + 1; i < flow.states.length; i++) {
		const s = flow.states[i];
		if (s.sizes && !s.sizes.includes(t.size)) {
			t.history.push({ state: s.id, kind: "auto-skip", at: Date.now(), text: `size ${t.size}` });
			continue;
		}
		t.state = i;
		return;
	}
	t.status = "done";
}

// ---------- commands ----------

function cmdStart({ flags, pos }) {
	const [flowName, ...goalParts] = pos;
	const goal = goalParts.join(" ").trim();
	if (!flowName || !goal) die(`usage: vstack start <${listFlows().join("|")}> "<goal>" [--size S|M|L] [--id name]`);
	const flow = loadFlow(flowName);
	const size = String(flags.size ?? "M").toUpperCase();
	if (!SIZES.includes(size)) die(`--size must be S, M or L`);
	const t = {
		id: uniqueId(slug(String(flags.id ?? goal))),
		flow: flowName,
		goal,
		size,
		state: -1,
		status: "active",
		worktree: ROOT,
		branch: git(["branch", "--show-current"]) || null,
		startSha: git(["rev-parse", "HEAD"]),
		created: Date.now(),
		history: [],
		notes: [],
	};
	advance(t, flow);
	saveTask(t);
	writeAtomic(pointerFile(), t.id);
	printStep(t);
}

function cmdDone({ flags, pos }) {
	const t = currentTask(flags);
	if (t.status !== "active") die(`${t.id} is ${t.status}`);
	const flow = loadFlow(t.flow);
	const st = flow.states[t.state];
	const text = pos.join(" ").trim();
	if (text.length < 12) die(`evidence required for "${st.id}": ${st.exit}`);
	if (st.observed && HEDGE.test(text.replace(/`[^`]*`|"[^"]*"|'[^']*'/g, "")))
		die(
			`"${st.id}" needs observed evidence, not predictions. Run it and say what you saw. Quote output or test names in backticks.`,
		);
	if (st.verified && t.fingerprint && t.fingerprint !== fingerprint(t))
		die(`code changed since verify. Re-verify: vstack back verify "changed after review"`);
	if (st.run?.length && !runGates(st.run, t))
		die(`gate failed, still on "${st.id}". Fix and run vstack done again, or vstack back <step> "<why>".`);
	if (st.run?.length) t.fingerprint = fingerprint(t);
	t.history.push({ state: st.id, kind: "done", at: Date.now(), text });
	advance(t, flow);
	saveTask(t);
	if (t.status === "done") {
		out(`✓ ${t.id} complete. Reply per the vstack skill: outcome first, choices and why, the evidence, open decisions.`);
		return;
	}
	printStep(t);
}

function cmdSkip({ flags, pos }) {
	const t = currentTask(flags);
	const flow = loadFlow(t.flow);
	const st = flow.states[t.state];
	const reason = pos.join(" ").trim();
	if (st.must) die(`"${st.id}" cannot be skipped in the ${t.flow} flow.`);
	if (reason.length < 8) die(`say why you are skipping "${st.id}"`);
	t.history.push({ state: st.id, kind: "skip", at: Date.now(), text: reason });
	advance(t, flow);
	saveTask(t);
	printStep(t);
}

function cmdBack({ flags, pos }) {
	const [target, ...why] = pos;
	const t = currentTask(flags);
	const flow = loadFlow(t.flow);
	const i = flow.states.findIndex((s) => s.id === target);
	const reason = why.join(" ").trim();
	if (i < 0 || i >= t.state) die(`can go back to: ${flow.states.slice(0, t.state).map((s) => s.id).join(", ") || "nothing"}`);
	if (reason.length < 8) die(`say why you are going back to "${target}"`);
	t.history.push({ state: flow.states[t.state].id, kind: "back", at: Date.now(), text: `→ ${target}: ${reason}` });
	t.state = i;
	t.status = "active";
	saveTask(t);
	printStep(t);
}

function cmdNote({ flags, pos }) {
	const t = currentTask(flags);
	const text = pos.join(" ").trim();
	if (!text) die(`usage: vstack note "<decision> because <why>"`);
	t.notes.push({ at: Date.now(), state: loadFlow(t.flow).states[t.state]?.id, text });
	saveTask(t);
	out(`noted (${t.notes.length})`);
}

function cmdCheck({ flags, pos }) {
	const t = currentTask(flags, { required: false });
	const names = pos.length ? pos : ["types", "lint", "test", "slop"];
	if (!runGates(names, t)) process.exitCode = 1;
}

function cmdBrief({ flags }) {
	const t = currentTask(flags, { required: false });
	const frame = t && lastEvidence(t, "frame");
	const design = t && (lastEvidence(t, "design") ?? lastEvidence(t, "root-cause"));
	const checks = Object.entries(cfg().checks)
		.filter(([, c]) => c)
		.map(([n, c]) => `${n}: ${c}`);
	if (flags.review) return reviewBrief(t, frame);
	out(`You are implementing one scoped unit for a lead engineer who will review your diff.
GOAL      ${t?.goal ?? "<one sentence outcome>"}
CONTEXT   ${frame ?? "<acceptance criteria, pointers to files>"}${design ? `\nDESIGN    ${design}` : ""}
SCOPE     write only: <paths>. do not touch: <paths>
ACCEPT    every acceptance criterion above, checkably met
VERIFY    ${checks.length ? checks.join(" · ") : "<commands>"} · then exercise the behavior on the real surface
RULES     name the data shape before logic. smallest diff that meets ACCEPT. no new abstractions without a second caller.
          no narrating comments, no type escapes or lint suppressions, no swallowed errors, no debug output.
          follow the closest existing pattern. commit each unit that passes its check.
FORBIDDEN push, merge, rebase shared branches, edits outside SCOPE, editing tests to make them pass.
REPORT    files changed · commands run and their results · deviations from DESIGN and why · open questions.
          state facts you observed. label anything else inferred or guess.`);
}

function reviewBrief(t, frame) {
	const base = diffBase(t);
	const diff = git(["diff", "--no-color", "--no-ext-diff", base]) ?? "";
	const extra = untracked();
	const limit = 120_000;
	out(`You are a skeptical senior reviewer with no stake in this code. Find what would block a real PR.
INTENT    ${t?.goal ?? "(infer from the diff and commit messages)"}${frame ? `\nCRITERIA  ${frame}` : ""}
LOOK FOR  correctness: wrong logic, unhandled states, races, broken edge cases (empty, null, huge, concurrent, retry).
          security and data: injection, authz gaps, secrets, destructive operations, migrations.
          design: scattered conditionals that want a state machine or table, illegal states the types allow,
          shallow wrappers, duplicated rules, abstractions with one caller, compatibility shims left behind.
          slop: code that does not need to exist, narrating comments, defensive checks for impossible states,
          tests that assert implementation instead of behavior, tests edited to pass.
RULES     read surrounding code before claiming a bug. cite file:line. no style nitpicks a linter would catch.
          say "no blocking issues" if that is the truth. do not edit files.
OUTPUT    one line per finding: [blocker|major|minor] file:line. problem. why it matters. suggested fix.
          then one line: overall verdict.
DIFF      against ${base.slice(0, 12)}${extra.length ? `, plus untracked: ${extra.join(", ")}` : ""}`);
	out(diff.length > limit ? `${diff.slice(0, limit)}\n… diff truncated. Run: git diff ${base}` : diff || "(no tracked changes)");
}

function ago(ms) {
	const m = Math.round((Date.now() - ms) / 60000);
	return m < 60 ? `${m}m` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

function cmdBoard({ flags }) {
	const tasks = allTasks()
		.filter((t) => flags.all || t.status === "active")
		.sort((a, b) => b.updated - a.updated);
	if (!tasks.length) {
		out(flags.all ? "no tasks" : "no active tasks (vstack board --all for finished)");
		return;
	}
	const rows = tasks.map((t) => {
		const flow = readJSON(firstExisting(flowDirs().map((d) => path.join(d, `${t.flow}.json`))) ?? "") ?? { states: [] };
		const st = flow.states[t.state];
		const vis = activeStates(flow, t.size);
		const step = t.status === "active" && st ? `${vis.indexOf(st) + 1}/${vis.length} ${st.id}` : t.status;
		const stale = t.status === "active" && Date.now() - t.updated > STALE_MS ? "!" : "";
		const where = t.worktree === ROOT ? "." : path.relative(ROOT, t.worktree) || ".";
		return [t.id, t.flow, t.size, step, `${ago(t.updated)}${stale}`, t.branch ?? "-", where];
	});
	const head = ["task", "flow", "size", "step", "updated", "branch", "worktree"];
	const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
	for (const r of [head, ...rows]) out(r.map((c, i) => String(c).padEnd(w[i])).join("  ").trimEnd());
}

function cmdLog({ flags }) {
	const t = currentTask(flags);
	out(`${t.id} · ${t.flow} · ${t.size} · ${t.status}\ngoal: ${t.goal}`);
	for (const h of t.history) out(`${new Date(h.at).toISOString().slice(0, 16)} ${h.kind.padEnd(9)} ${h.state}: ${h.text}`);
	if (t.notes.length) out("notes:");
	for (const n of t.notes) out(`${new Date(n.at).toISOString().slice(0, 16)} [${n.state ?? "-"}] ${n.text}`);
}

function cmdUse({ pos }) {
	const [id] = pos;
	if (!id || !readJSON(taskFile(id))) die(`usage: vstack use <id>. tasks: ${allTasks().map((t) => t.id).join(", ")}`);
	writeAtomic(pointerFile(), id);
	printStep(readJSON(taskFile(id)));
}

function cmdAbandon({ flags, pos }) {
	const t = currentTask(flags);
	const reason = pos.join(" ").trim();
	if (reason.length < 8) die(`say why`);
	t.status = "abandoned";
	t.history.push({ state: loadFlow(t.flow).states[t.state]?.id ?? "-", kind: "abandon", at: Date.now(), text: reason });
	saveTask(t);
	out(`abandoned ${t.id}`);
}

function cmdInit({ flags }) {
	const file = path.join(ROOT, "vstack.json");
	if (fs.existsSync(file) && !flags.force) die(`vstack.json exists (--force to overwrite)`);
	const conf = { base: baseBranch(), checks: detectChecks(), slop: { off: [], ignore: [], budget: { S: 200, M: 800 } } };
	writeAtomic(file, `${JSON.stringify(conf, null, "\t")}\n`);
	out(`wrote vstack.json. Edit "checks" if any command is wrong or slow:`);
	for (const [k, v] of Object.entries(conf.checks)) out(`  ${k}: ${v}`);
	if (!Object.keys(conf.checks).length) out(`  (nothing detected, add test/types/lint commands)`);
}

const HELP = `vstack: gated workflows for coding agents. One step at a time.

  vstack start <flow> "<goal>" [--size S|M|L]   flows: ${listFlows().join(", ")}
  vstack                        show the current step
  vstack done "<evidence>"      run the step's gates, record evidence, advance
  vstack skip "<reason>"        skip an optional step
  vstack back <step> "<why>"    return to an earlier step
  vstack note "<decision>"      log a decision and why
  vstack check [gates…]         run types, lint, test, slop without advancing
  vstack slop                   scan the diff for slop only
  vstack brief [--review]       self-contained prompt for a subagent or reviewer model
  vstack board [--all]          every task in this repo, across worktrees
  vstack log | use <id> | abandon "<why>" | init | flows
  --task <id> or VSTACK_TASK selects a task explicitly.`;

const COMMANDS = {
	start: cmdStart,
	done: cmdDone,
	skip: cmdSkip,
	back: cmdBack,
	note: cmdNote,
	check: cmdCheck,
	slop: (a) => {
		if (slop(currentTask(a.flags, { required: false })).fails) process.exitCode = 1;
	},
	brief: cmdBrief,
	board: cmdBoard,
	log: cmdLog,
	use: cmdUse,
	abandon: cmdAbandon,
	init: cmdInit,
	flows: () => listFlows().forEach((f) => out(`${f.padEnd(12)} ${loadFlow(f).about ?? ""}`)),
	status: (a) => {
		const t = currentTask(a.flags, { required: false });
		if (t) printStep(t);
		else out(HELP);
	},
	help: () => out(HELP),
};

try {
	const [cmd = "status", ...rest] = process.argv.slice(2);
	const fn = COMMANDS[cmd] ?? (cmd === "-h" || cmd === "--help" ? COMMANDS.help : null);
	if (!fn) die(`unknown command "${cmd}"\n\n${HELP}`);
	fn(parseArgs(rest));
} catch (e) {
	if (!(e instanceof Exit)) throw e;
}
