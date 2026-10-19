import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "vstack", "vstack.mjs");
let repo;

function sh(cmd, args, cwd = repo) {
	const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, VSTACK_TASK: "" } });
	return { code: r.status, out: r.stdout + r.stderr };
}
const vs = (...args) => sh("node", [CLI, ...args]);
const write = (rel, text) => {
	fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
	fs.writeFileSync(path.join(repo, rel), text);
};

beforeEach(() => {
	repo = fs.mkdtempSync(path.join(os.tmpdir(), "vstack-"));
	sh("git", ["init", "-q", "-b", "main"]);
	sh("git", ["config", "user.email", "t@t"]);
	sh("git", ["config", "user.name", "t"]);
	write("vstack.json", JSON.stringify({ checks: { test: "node -e 0", types: null, lint: null } }));
	write("src/a.ts", "export const a = 1;\n");
	sh("git", ["add", "."]);
	sh("git", ["commit", "-qm", "init"]);
});

test("size S feature walks frame, build, verify, ship and skips the rest", () => {
	let r = vs("start", "feature", "add a b export", "--size", "S");
	assert.match(r.out, /\[feature 1\/4\] frame/);
	r = vs("done", "goal: export b. acceptance: b === 2");
	assert.match(r.out, /\[feature 2\/4\] build/);
	assert.match(r.out, /Subtract before adding/, "build step inlines build principles");
	write("src/b.ts", "export const b = 2;\n");
	r = vs("done", "added src/b.ts exporting b");
	assert.match(r.out, /verify/);
	r = vs("done", "ran `node -e \"console.log(require('./src/b.ts'))\"` and saw b is 2");
	assert.equal(r.code, 0, r.out);
	assert.match(r.out, /✓ test/);
	assert.match(r.out, /✓ slop/);
	assert.match(r.out, /\[feature 4\/4\] ship/);
	r = vs("done", "ready on branch main, commit pending user ok");
	assert.match(r.out, /complete/);
	assert.match(r.out, /every material change and why/);
	assert.match(r.out, /briefly in plain language/);
	assert.match(r.out, /No process recap/);
	assert.match(vs("log").out, /auto-skip design: size S/);
});

test("observed steps reject predictions but allow quoted test names", () => {
	vs("start", "bugfix", "crash on empty input", "--size", "S");
	let r = vs("done", "it should crash when input is empty");
	assert.equal(r.code, 1);
	assert.match(r.out, /observed evidence/);
	r = vs("done", "ran `node cli.js ''`, got TypeError at parse.ts:4; test `should not crash` fails");
	assert.equal(r.code, 0, r.out);
	assert.match(r.out, /root-cause/);
});

test("must steps cannot be skipped", () => {
	vs("start", "feature", "x thing", "--size", "M");
	const r = vs("skip", "do not need framing");
	assert.equal(r.code, 1);
	assert.match(r.out, /cannot be skipped/);
});

test("slop gate blocks type escapes and swallowed errors, vstack-ok allows a line", () => {
	write("src/c.ts", "export const c = (x: unknown) => x as any;\ntry { f() } catch (e) {}\n// Update the counter\n");
	let r = vs("slop");
	assert.equal(r.code, 1);
	assert.match(r.out, /src\/c\.ts:1 type-escape/);
	assert.match(r.out, /src\/c\.ts:2 swallowed-error/);
	assert.match(r.out, /src\/c\.ts:3 narrating-comment/);
	write("src/c.ts", "export const c = (x: unknown) => x as any; // vstack-ok: third-party types are wrong\n");
	r = vs("slop");
	assert.equal(r.code, 0, r.out);
});

test("slop scans committed changes since task start, not just the working tree", () => {
	vs("start", "feature", "commit slop", "--size", "S");
	write("src/d.ts", "// @ts-ignore\nexport const d = 1;\n");
	sh("git", ["add", "."]);
	sh("git", ["commit", "-qm", "d"]);
	const r = vs("slop");
	assert.equal(r.code, 1);
	assert.match(r.out, /src\/d\.ts:1 type-escape/);
});

test("failing check blocks advance and prints only the tail", () => {
	write("vstack.json", JSON.stringify({ checks: { test: "node -e \"for(let i=0;i<100;i++)console.log('line'+i);process.exit(1)\"" } }));
	sh("git", ["commit", "-qam", "cfg"]);
	vs("start", "refactor", "rename thing", "--size", "S");
	const r = vs("done", "baseline: ran `npm test`, captured output");
	assert.equal(r.code, 1);
	assert.match(r.out, /✗ test/);
	assert.match(r.out, /lines above/);
	assert.match(r.out, /line99/);
	assert.doesNotMatch(r.out, /line10\n/);
	assert.match(vs().out, /baseline/, "still on baseline");
});

test("code changed after verify forces re-verify before ship", () => {
	vs("start", "feature", "late change", "--size", "S");
	vs("done", "goal: late change test. acceptance: works");
	write("src/e.ts", "export const e = 1;\n");
	vs("done", "added src/e.ts");
	vs("done", "ran `node -e 0` and observed exit 0");
	write("src/e.ts", "export const e = 2;\n");
	let r = vs("done", "ready on branch main");
	assert.equal(r.code, 1);
	assert.match(r.out, /code changed since verify/);
	r = vs("back", "verify", "changed e after verify");
	assert.match(r.out, /verify/);
	vs("done", "ran `node -e 0` and observed exit 0 again");
	r = vs("done", "ready on branch main");
	assert.match(r.out, /complete/);
});

test("back only goes to earlier steps", () => {
	vs("start", "feature", "back test", "--size", "M");
	const r = vs("back", "ship", "jump forward please");
	assert.equal(r.code, 1);
	assert.match(r.out, /can go back to: nothing/);
});

test("board shows tasks from every worktree", () => {
	vs("start", "feature", "main tree task", "--size", "S");
	const wt = `${repo}-wt`;
	sh("git", ["worktree", "add", "-q", wt, "-b", "other"]);
	sh("node", [CLI, "start", "bugfix", "worktree task", "--size", "S"], wt);
	const r = vs("board");
	assert.match(r.out, /main-tree-task\s+feature\s+S\s+1\/4 frame/);
	assert.match(r.out, /worktree-task\s+bugfix\s+S\s+1\/5 reproduce .* other/);
	fs.rmSync(wt, { recursive: true, force: true });
});

test("review brief carries intent and the diff", () => {
	vs("start", "feature", "brief me", "--size", "M");
	vs("done", "goal: brief. acceptance: diff appears in brief");
	write("src/f.ts", "export const f = 42;\n");
	const r = vs("brief", "--review");
	assert.match(r.out, /INTENT\s+brief me/);
	assert.match(r.out, /CRITERIA\s+goal: brief/);
	assert.match(r.out, /untracked: src\/f\.ts/);
	assert.match(r.out, /export const f = 42;/, "untracked file content is inlined");
});

test("principles print once per task, status repeats them", () => {
	vs("start", "feature", "dedupe principles", "--size", "M");
	let r = vs("done", "goal: dedupe. acceptance: data shape printed once");
	assert.match(r.out, /Data shape first/, "design shows it first");
	r = vs("done", "design: one shown list on the task");
	assert.match(r.out, /\[feature 3\/6\] build\n/);
	assert.match(r.out, /Subtract before adding/);
	assert.doesNotMatch(r.out, /Data shape first/, "build does not repeat it");
	assert.match(vs().out, /Data shape first/, "status shows every principle");
});

test("unconfigured checks share one line, passing checks share one line", () => {
	vs("start", "feature", "gate lines", "--size", "S");
	vs("done", "goal: gate lines. acceptance: compact");
	vs("done", "built nothing at all");
	const r = vs("done", "ran `node -e 0` and saw exit 0");
	assert.match(r.out, /- not configured: types, lint/);
	assert.match(r.out, /✓ test \d/);
});

test("review auto-skips a small size M diff and runs on a large one", () => {
	vs("start", "feature", "tiny diff", "--size", "M");
	vs("done", "goal: tiny. acceptance: review skipped");
	vs("done", "design: one line change");
	write("src/a.ts", "export const a = 2;\n");
	vs("done", "changed src/a.ts");
	let r = vs("done", "ran `node -e 0` and saw exit 0");
	assert.match(r.out, /\] ship/);
	assert.match(vs("log").out, /auto-skip review: diff under 20 lines/);

	vs("start", "feature", "big diff", "--size", "M");
	vs("done", "goal: big. acceptance: review runs");
	vs("done", "design: many lines");
	write("src/big.ts", Array.from({ length: 30 }, (_, i) => `export const v${i} = ${i};`).join("\n"));
	vs("done", "added src/big.ts");
	r = vs("done", "ran `node -e 0` and saw exit 0");
	assert.match(r.out, /\] review/);
});

test("vstack.json minDiff overrides the flow threshold", () => {
	write("vstack.json", JSON.stringify({ checks: { test: "node -e 0" }, minDiff: { M: 0 } }));
	sh("git", ["commit", "-qam", "cfg"]);
	vs("start", "feature", "always review", "--size", "M");
	vs("done", "goal: always. acceptance: review runs");
	vs("done", "design: config override");
	write("src/a.ts", "export const a = 3;\n");
	vs("done", "changed src/a.ts");
	assert.match(vs("done", "ran `node -e 0` and saw exit 0").out, /\] review/);
});

test("worker brief is compact and requires a complete concise report", () => {
	vs("start", "feature", "compact brief", "--size", "M");
	vs("done", "goal: compact brief. acceptance: reports every change");
	const r = vs("brief");
	assert.match(r.out, /briefly explain every material change and why/);
	assert.ok(r.out.split(/\s+/).length < 140, `brief has too many words: ${r.out}`);
});

test("review brief caps large diffs", () => {
	vs("start", "feature", "bounded review", "--size", "M");
	vs("done", "goal: bounded review. acceptance: cap embedded diff");
	write("src/a.ts", `${"x".repeat(50_000)}TAIL_MARKER\n`);
	const r = vs("brief", "--review");
	assert.match(r.out, /… diff truncated\. Run: git diff/);
	assert.doesNotMatch(r.out, /TAIL_MARKER/);
	assert.ok(r.out.length < 42_000, `review brief is too large: ${r.out.length}`);
});

test("a flow file edited mid-task keeps the task on its step", () => {
	const flow = (ids) => JSON.stringify({ states: ids.map((id) => ({ id, do: `do ${id}`, exit: "x" })) });
	write(".vstack/flows/edit.json", flow(["one", "two", "three"]));
	vs("start", "edit", "edited flow");
	vs("done", "finished step one");
	write(".vstack/flows/edit.json", flow(["one", "two", "three"].filter((id) => id !== "one")));
	assert.match(vs().out, /\[edit 1\/2\] two/);
	assert.match(vs("done", "finished step two").out, /\[edit 2\/2\] three/);
});

test("tasks saved before step ids map old indexes to the merged steps", () => {
	vs("start", "feature", "legacy task", "--size", "M");
	const dir = sh("git", ["rev-parse", "--git-common-dir"]).out.trim();
	const file = path.join(repo, dir, "vstack", "tasks", "legacy-task.json");
	const set = (state) => {
		const t = JSON.parse(fs.readFileSync(file, "utf8"));
		delete t.step;
		fs.writeFileSync(file, JSON.stringify({ ...t, state }));
	};
	set(1);
	assert.match(vs().out, /\] design/, "old understand maps to design");
	set(3);
	assert.match(vs().out, /\] build/, "old build index 3 stays build");
});

test("review never auto-skips a diff with binary files, brief withholds secret files", () => {
	vs("start", "feature", "binary diff", "--size", "M");
	vs("done", "goal: binary. acceptance: review runs");
	vs("done", "design: add an image");
	fs.writeFileSync(path.join(repo, "logo.png"), Buffer.from([0, 1, 2, 0, 255]));
	write(".env.local", "API_KEY=sk-secret\n");
	vs("done", "added logo.png");
	assert.match(vs("done", "ran `node -e 0` and saw exit 0").out, /\] review/);
	const r = vs("brief", "--review");
	assert.match(r.out, /untracked: \.env\.local\n\(content withheld/);
	assert.doesNotMatch(r.out, /sk-secret/);
});

test("project flows override bundled ones", () => {
	write(".vstack/flows/tiny.json", JSON.stringify({ about: "one step", states: [{ id: "only", do: "do it", exit: "done" }] }));
	assert.match(vs("flows").out, /tiny\s+one step/);
	assert.match(vs("start", "tiny", "custom flow").out, /\[tiny 1\/1\] only/);
});

test("type escapes in test files warn instead of failing", () => {
	write("src/__tests__/g.test.ts", "const mock = {} as any;\n");
	const r = vs("slop");
	assert.equal(r.code, 0, r.out);
	assert.match(r.out, /⚠ src\/__tests__\/g\.test\.ts:1 type-escape/);
});

test("board shows the branch the agent switched to after start", () => {
	vs("start", "feature", "branch later", "--size", "S");
	sh("git", ["checkout", "-q", "-b", "feat/later"]);
	vs("done", "goal: branch later. acceptance: board shows branch");
	assert.match(vs("board").out, /branch-later\s+feature\s+S\s+2\/4 build\s+\S+\s+feat\/later/);
});
