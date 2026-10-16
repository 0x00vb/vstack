---
name: vstack
description: Run coding work as a gated state machine (feature, bugfix, refactor, investigate, spike) through the `vstack` CLI, so each step needs evidence and green checks before the next. Use for any change beyond a trivial edit, when the user says vstack, or when they want rigorous, verified, low-slop work.
---

# vstack

The `vstack` CLI holds the workflow. It prints one step at a time and refuses to advance without evidence and passing gates. Do not read the flow files. Follow what the CLI prints.

## Pick a flow

| Task | Flow |
|---|---|
| New or changed behavior | `feature` |
| A reported defect | `bugfix` |
| Behavior-preserving restructure | `refactor` |
| Read-only question | `investigate` |
| Settle a design question by building a throwaway | `spike` |

Size: `S` is one obvious change in one or two files and skips understand, design, and review. `M` is the default. `L` is cross-cutting or contested and gets two designs and two reviewers. A trivial edit (typo, one config value) needs no flow.

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

Say what you ran and what you saw. Quote output and test names in backticks. Observed steps reject predictions ("should work", "looks good"). A gate failure prints only the tail of the output. Fix it and run `vstack done` again.

## Subagents

Give a subagent the `vstack brief` output with SCOPE filled in, not your whole context. Subagents do not run flows. You own their diff, so read it before you run `vstack done`. Run review on a different model from the builder when you can. If you cannot spawn subagents, do the step yourself.

## Autonomy

Proceed on reversible work. Ask only for product calls you cannot settle by running something. Pause before irreversible or outward actions (push to shared branches, merge, deploy, delete data, message people) unless the user authorized them.

## Reply

Lead with the outcome for the user. Then what you chose and why, how you verified it (the evidence), and open decisions. Short sentences. Label claims measured, inferred, or guess. Link only things you produced or read.
