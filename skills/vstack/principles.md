# Principles

Each line: name, the steps it applies to, the rule. `vstack` puts the matching lines into the step it prints, so agents only see the ones that apply. Edit freely. Keep the format `- **Name** `tags` - rule`.

- **Data shape first** `design build` - Name the data and the structure that organizes it before writing logic: a state machine instead of booleans that must stay in sync, a discriminated union instead of optional fields, a table or registry instead of a growing if/else, a reducer instead of scattered mutation. Smell: the feature adds one more branch to an existing chain.
- **Illegal states unrepresentable** `design` - Make the types forbid what must never happen. Parse external data once at the boundary and trust internal types after. Smell: casts, `any`, optional fields that are always set.
- **Guards at boundaries** `design build` - Validate at the edges (HTTP, CLI, config, third-party APIs) and keep core logic pure. Smell: the same null check in five layers.
- **Redesign, don't bolt on** `design` - Fit a new requirement in as if it had been there from day one. Smell: a special case for the new thing.
- **Deep over shallow** `design` - Prefer a small interface hiding real complexity over many thin layers. Collapse one-caller wrappers. Smell: four files open to answer one question.
- **Two designs when there is no precedent** `design` - For a novel interaction or architecture, sketch two structurally different shapes before committing to one.
- **Idempotent operations** `design` - Commands, jobs, and migrations converge to the same end state when retried or re-run after a crash.
- **Smallest diff** `build` - The least code that meets the criteria. No speculative options, layers, or config. When unsure, delete.
- **Subtract before adding** `build` - Remove dead code and redundant checks first, then build on the simpler base.
- **One source of truth** `build` - Make each decision in one place and pass the result along.
- **Migrate, then delete** `build` - A new internal API moves every caller and deletes the old one in the same change.
- **Comments only for why** `build` - Keep a comment only for a non-obvious reason the code cannot show.
- **Build the lever** `build` - Repetitive edits or checks get a codemod or script. The script is the proof a reviewer reruns.
- **Separate before serializing** `build parallel` - If two actors (agents, workers, requests) could write the same file, branch, or key, split the target first. Lock only for a real invariant.
- **Fix the root cause** `debug` - Fix at the first place the system went wrong. A guard is a fix only when the state it handles is legitimate.
- **Attack the premise** `debug` - Two fixes that share a premise have failed? Write the premise down and test it before writing a third.
- **Suspect the observation** `debug verify` - When a check disagrees with what you expect, verify the check (stale build, wrong env, cached output) before changing the code.
- **Prove it on the real artifact** `verify` - Run the feature, read the actual value, inspect the real output. Not a proxy, a self-report, or "it compiles".
- **Explain the number** `verify` - Before trusting a measurement, name what limits it and rule out that it measured something else (warm cache, wrong build, a no-op).
- **Test behavior, not implementation** `verify build` - Assert what users of the code can observe. The test fails when behavior breaks and survives a refactor of internals.
