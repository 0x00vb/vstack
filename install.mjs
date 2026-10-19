#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = ["vstack"];
const LEGACY = ["vstack-review", "vstack-parallel"];
const START = "<!-- vstack:start -->";
const END = "<!-- vstack:end -->";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const DRY = has("--dry-run");
const FORCE = has("--force");
const UNINSTALL = has("--uninstall");
const projectIdx = args.indexOf("--project");
const PROJECT = projectIdx >= 0 ? path.resolve(args[projectIdx + 1] ?? ".") : null;
const HOME = process.env.VSTACK_HOME ?? os.homedir();

const log = (s) => console.log(`${DRY ? "[dry-run] " : ""}${s}`);
const tilde = (p) => (p.startsWith(HOME) ? `~${p.slice(HOME.length)}` : p);

function lstat(p) {
	try {
		return fs.lstatSync(p);
	} catch {
		return null;
	}
}

const ownedLink = (p) => {
	const s = lstat(p);
	return s?.isSymbolicLink() && path.resolve(path.dirname(p), fs.readlinkSync(p)).startsWith(REPO);
};

function link(target, at) {
	const s = lstat(at);
	if (s && !ownedLink(at) && !FORCE) {
		log(`  skip   ${tilde(at)} exists and is not a vstack link (--force replaces it)`);
		return;
	}
	log(`  link   ${tilde(at)} → ${tilde(target)}`);
	if (DRY) return;
	fs.mkdirSync(path.dirname(at), { recursive: true });
	if (s) fs.rmSync(at, { recursive: true, force: true });
	fs.symlinkSync(target, at, fs.statSync(target).isDirectory() ? "dir" : "file");
}

function copyDir(from, to) {
	log(`  copy   ${tilde(to)}`);
	if (DRY) return;
	fs.rmSync(to, { recursive: true, force: true });
	fs.cpSync(from, to, { recursive: true });
}

function unlink(at) {
	if (!ownedLink(at)) return;
	log(`  remove ${tilde(at)}`);
	if (!DRY) fs.rmSync(at);
}

function stripBlock(text) {
	const re = new RegExp(`\\n*${START}[\\s\\S]*?${END}\\n?`, "g");
	return text.replace(re, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function putBlock(file, body) {
	const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
	const kept = stripBlock(before);
	const next = `${kept ? `${kept}\n\n` : ""}${START}\n${body.trim()}\n${END}\n`;
	log(`  rules  ${tilde(file)}${before.includes(START) ? " (updated)" : ""}`);
	if (DRY) return;
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, next);
}

function removeBlock(file) {
	if (!fs.existsSync(file)) return;
	const before = fs.readFileSync(file, "utf8");
	if (!before.includes(START)) return;
	const kept = stripBlock(before);
	log(`  rules  ${tilde(file)} (block removed${kept ? "" : ", file deleted"})`);
	if (DRY) return;
	if (kept) fs.writeFileSync(file, `${kept}\n`);
	else fs.rmSync(file);
}

const CLI = path.join(REPO, "skills", "vstack", "vstack.mjs");
const kernel = fs.readFileSync(path.join(REPO, "rules", "kernel.md"), "utf8");

function global() {
	const skillDirs = [path.join(HOME, ".agents", "skills"), path.join(HOME, ".claude", "skills")];
	const ruleFiles = [path.join(HOME, ".claude", "CLAUDE.md"), path.join(HOME, ".codex", "AGENTS.md")];
	if (fs.existsSync(path.join(HOME, ".gemini"))) ruleFiles.push(path.join(HOME, ".gemini", "GEMINI.md"));
	const bin = path.join(HOME, ".local", "bin", "vstack");

	log(UNINSTALL ? "Uninstalling vstack (global)" : "Installing vstack (global)");
	for (const dir of skillDirs) {
		for (const s of LEGACY) unlink(path.join(dir, s));
		for (const s of SKILLS) UNINSTALL ? unlink(path.join(dir, s)) : link(path.join(REPO, "skills", s), path.join(dir, s));
	}
	UNINSTALL ? unlink(bin) : link(CLI, bin);
	for (const f of ruleFiles) UNINSTALL ? removeBlock(f) : putBlock(f, kernel);
	if (UNINSTALL) return;

	if (!DRY) fs.chmodSync(CLI, 0o755);
	const onPath = (process.env.PATH ?? "").split(path.delimiter).includes(path.dirname(bin));
	if (!onPath) log(`\n  ! ${tilde(path.dirname(bin))} is not on PATH. Add it, or alias vstack="node ${CLI}"`);
	log(`\nCursor reads ~/.agents/skills. It has no global rules file, so paste rules/kernel.md into
Cursor Settings > Rules, or run: node install.mjs --project <repo>`);
}

function project() {
	const agentsSkills = path.join(PROJECT, ".agents", "skills");
	const claudeSkills = path.join(PROJECT, ".claude", "skills");
	const agentsMd = path.join(PROJECT, "AGENTS.md");
	const claudeMd = path.join(PROJECT, "CLAUDE.md");

	log(`${UNINSTALL ? "Uninstalling" : "Installing"} vstack into ${PROJECT}`);
	for (const s of UNINSTALL ? [...LEGACY, ...SKILLS] : LEGACY) {
		for (const p of [path.join(agentsSkills, s), path.join(claudeSkills, s)])
			if (lstat(p)) {
				log(`  remove ${p}`);
				if (!DRY) fs.rmSync(p, { recursive: true, force: true });
			}
	}
	if (UNINSTALL) {
		removeBlock(agentsMd);
		removeBlock(claudeMd);
		return;
	}

	for (const s of SKILLS) {
		copyDir(path.join(REPO, "skills", s), path.join(agentsSkills, s));
		const at = path.join(claudeSkills, s);
		log(`  link   .claude/skills/${s} → ../../.agents/skills/${s}`);
		if (DRY) continue;
		fs.mkdirSync(claudeSkills, { recursive: true });
		fs.rmSync(at, { recursive: true, force: true });
		fs.symlinkSync(path.join("..", "..", ".agents", "skills", s), at, "dir");
	}
	const local = `${kernel.trim()}\nIf \`vstack\` is not on PATH, run \`node .agents/skills/vstack/vstack.mjs\` instead.`;
	putBlock(agentsMd, local);
	const claude = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, "utf8") : "";
	if (claude.includes("@AGENTS.md")) log(`  rules  CLAUDE.md already imports AGENTS.md`);
	else putBlock(claudeMd, "@AGENTS.md");
	log(`\nCommit .agents/skills/, .claude/skills/, AGENTS.md and CLAUDE.md so the whole team gets it.
Run \`node .agents/skills/vstack/vstack.mjs init\` to pin the test/types/lint commands in vstack.json.`);
}

PROJECT ? project() : global();
