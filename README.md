# vstack

Gated workflows for coding agents. The agent gets one step at a time and can't move on without evidence and green checks. Built on [pstack](https://github.com/cursor/plugins/tree/main/pstack)'s ideas, cut down to what keeps agents honest, and portable to any agent that reads [Agent Skills](https://agentskills.io) (Claude Code, Codex, Cursor, Gemini CLI).

## Why it is smaller

pstack puts the workflow in prose the model has to read: a 20 KB router, playbooks, about 25 principle files, and an agent definition that has every subagent re-read the router. vstack puts the workflow in a CLI, so the model reads only the step it is on.

| Measured (characters) | pstack | vstack |
|---|---|---|
| Skill descriptions, always in context | 11,539 (≈50 skills) | 793 (3 skills) |
| Lead agent, one feature task | ≈86,800 (minimum read path) | ≈11,200 (skill + every printed step) |
| Preamble per subagent | 21,678 | ≈1,000 (`vstack brief`) |

Gates are code, not paragraphs: the CLI runs your test, types, and lint commands, prints only the failing tail, scans the diff for slop, rejects "should work" as evidence, and makes you re-verify if code changes after verification.

## Install

```bash
git clone <this repo> ~/projects/vstack
node ~/projects/vstack/install.mjs              # global: every repo, every agent
node ~/projects/vstack/install.mjs --project .  # vendor into one repo for the team
node ~/projects/vstack/install.mjs --dry-run    # see what it would touch
node ~/projects/vstack/install.mjs --uninstall  # undo (add --project . for a repo)
```

Global install puts symlinks at `~/.agents/skills/` (Codex, Cursor) and `~/.claude/skills/` (Claude Code), symlinks the CLI to `~/.local/bin/vstack`, and adds a short marked block to `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` (and `~/.gemini/GEMINI.md` if present). It never overwrites a file it did not create. `git pull` updates everything. Cursor has no global rules file, so paste `rules/kernel.md` into Settings > Rules or use project mode.

Project install copies the CLI, flows, and principles into `.vstack/`, the skills into `.agents/skills/` (with `.claude/skills/` symlinks), and adds the block to `AGENTS.md`, plus `@AGENTS.md` in `CLAUDE.md`. Commit them. Teammates need only Node 20+.

## Use

```bash
vstack start feature "CSV export for attendees" --size M
vstack                       # current step
vstack done "<evidence>"     # gates run, then the next step prints
vstack board                 # every task across every worktree of this repo
```

| Flow | Steps (S skips the bracketed ones) |
|---|---|
| `feature` | frame, [understand], [design], build, verify, [review], ship |
| `bugfix` | reproduce, root-cause, [regression-test], fix, verify, [review], ship |
| `refactor` | baseline, [subtract], change, verify, [review], ship |
| `investigate` | question, evidence, answer |
| `spike` | question, sketch, observe, decide |

Checks are detected from `package.json` (pnpm, yarn, bun, npm), `go.mod`, `Cargo.toml`, or `pyproject.toml`. Run `vstack init` to pin them in `vstack.json`. In a monorepo, point them at the package you are working in, since the gates run them on every verify.

```json
{
	"base": "main",
	"checks": { "test": "pnpm --filter web test", "types": "pnpm --filter web exec tsc --noEmit", "lint": null },
	"slop": { "off": ["todo"], "ignore": ["**/generated/**"], "budget": { "S": 200, "M": 800 } }
}
```

## Slop gate

The scan covers lines added since the task started, both committed and uncommitted, plus untracked files. Failures block verify: `any` casts, `@ts-ignore`, lint suppressions, empty catches, and leftover `debugger` statements. Type escapes in test files only warn. Warnings: debug output, TODO markers, comments that narrate the code, commented-out code, and diffs over the size budget. Add `vstack-ok` to a line you mean to keep, with the reason.

## Many agents

One task per worktree (`git worktree add ../app-csv -b csv`). Each agent runs its own flow, and `vstack board` from any worktree shows them all. Task state lives in `.git/vstack/`, shared by worktrees, never committed, and each task file has one writer. Cross-model review works from any agent: `vstack brief --review | codex exec -` or `| claude -p`. See the `vstack-parallel` skill.

## Make it yours

- **Flows** are JSON in `flows/`. A project can add or override them in `.vstack/flows/`. Step fields: `do`, `exit`, `must` (can't skip), `observed` (rejects predictions), `run` (gates: `test`, `types`, `lint`, `slop`, or any key in `checks`), `sizes`, `verified` (blocks if the code changed since the last gate run), and `principles` (tags to inline).
- **Principles** are one line each in `skills/vstack/principles.md`, tagged by step. The CLI inlines only the matching ones.
- When you catch an agent repeating a mistake, add a slop rule or a gate before you add prose.

## Test

```bash
npm test
```
