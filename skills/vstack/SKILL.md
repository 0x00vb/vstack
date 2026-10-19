---
name: vstack
description: Gated state-machine workflows (feature, bugfix, refactor, investigate, spike) through the `vstack` CLI. Each step needs evidence and green checks. Use for any change beyond a trivial edit, to review a diff, to run agents in parallel, or when the user says vstack.
---

# vstack

The CLI prints one step at a time. Do it, then `vstack done "<evidence>"`. Do not read the flow files. If `vstack` is not on PATH, run `node <dir>/vstack.mjs`, where `<dir>` is the folder of this file (Node 20+).

Flows: `feature` new behavior · `bugfix` reported defect · `refactor` same behavior, new structure · `investigate` read-only question · `spike` throwaway that settles a design question.
Sizes: `S` one obvious change in one or two files · `M` default · `L` cross-cutting or contested.

```
vstack start <flow> "<goal>" --size M
vstack done "<evidence>"     # run gates, record, advance
vstack skip "<reason>"       # skippable steps only
vstack back <step> "<why>"
vstack                       # the current step in full
vstack note | check | brief [--review] | board | init
```

Evidence: what you ran and saw, quoted, in one to three lines. Write it once, in `vstack done`, not again in chat.

Give a subagent `vstack brief` with SCOPE filled in, not the conversation. Read its diff.

Review a diff: [review.md](review.md). Many agents at once: [parallel.md](parallel.md).

Get authorization before irreversible or outward actions.
