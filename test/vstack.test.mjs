import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "vstack.mjs");
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
	assert.match(r.out, /Smallest diff/, "build step inlines build principles");
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
	assert.match(vs("log").out, /auto-skip understand: size S/);
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
