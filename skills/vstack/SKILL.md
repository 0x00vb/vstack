---
name: vstack
description: Run coding work as a gated state machine (feature, bugfix, refactor, investigate, spike) through the `vstack` CLI, so each step needs evidence and green checks before the next. Use for any change beyond a trivial edit, when the user says vstack, or when they want rigorous, verified, low-slop work.
---

# vstack

The CLI prints one step at a time and advances only with evidence and green gates. Do not read flow files or restate the workflow. Follow the current step.

If `vstack` is not on PATH, run `node <dir>/vstack.mjs` instead, where `<dir>` is the folder containing this SKILL.md. Needs Node 20+.

## Pick a flow

| Task | Flow |
|---|---|
| New or changed behavior | `feature` |
| A reported defect | `bugfix` |
| Behavior-preserving restructure | `refactor` |
| Read-only question | `investigate` |
| Settle a design question by building a throwaway | `spike` |

Size: `S` is one obvious change in one or two files. `M` is the default. `L` is cross-cutting or contested. Trivial edits need no flow.

## Commands

```
vstack start feature "<goal>" --size M
vstack                         # current step
vstack done "<evidence>"       # run gates, record, advance
vstack skip "<reason>"         # optional steps only
vstack back <step> "<why>"     # e.g. design was wrong
vstack note "<decision> because <why>"
vstack check                   # types, lint, test, slop without advancing
vstack brief [--review]        # self-contained prompt for a subagent or reviewer
vstack board                   # all tasks in this repo, every worktree
```

If no `vstack.json` exists, checks are detected from the project. If detection is wrong, run `vstack init` and fix the commands.

## Evidence

Say what you ran and saw. Quote output or test names. Observed steps reject predictions. Fix failed gates and run `vstack done` again.

## Subagents

Give a subagent `vstack brief` with SCOPE filled in, not the full conversation. Subagents do not run flows. Read their diff before `vstack done`. When possible, use a different model for review.

## Autonomy

Proceed on reversible work. Ask only for product decisions experiments cannot settle. Get authorization before irreversible or outward actions.

## Reply

Use short, plain sentences. Cover the outcome, every material implementation change and why, verification evidence, and unresolved items. Mention each once; omit the process recap. Label anything inferred or guessed.
