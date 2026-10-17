# Principles

Each line: name, the steps it applies to, the rule. `vstack` puts the matching lines into the step it prints, so agents only see the ones that apply. Edit freely. Keep the format `- **Name** `tags` - rule`.

- **Data shape first** `design build` - Name the data and organizing structure before the logic. Prefer a state machine, union, table, or reducer when it removes scattered branches.
- **Illegal states unrepresentable** `design` - Use types to forbid invalid states. Parse once at the boundary; avoid casts and always-set optionals.
- **Guards at boundaries** `design build` - Validate at system edges and trust valid internal data.
- **Redesign, don't bolt on** `design` - Fit the requirement into the design; do not add a special case.
- **Deep over shallow** `design` - Prefer one useful interface over thin layers and one-caller wrappers.
- **Two designs when there is no precedent** `design` - Sketch two different structures, then choose one.
- **Idempotent operations** `design` - Retries must converge on the same result.
- **Smallest diff** `build` - Add only what meets the criteria. Delete speculative code.
- **Subtract before adding** `build` - Remove dead code and redundant checks first, then build on the simpler base.
- **One source of truth** `build` - Make each decision in one place and pass the result along.
- **Migrate, then delete** `build` - A new internal API moves every caller and deletes the old one in the same change.
- **Comments only for why** `build` - Keep a comment only for a non-obvious reason the code cannot show.
- **Build the lever** `build` - Script repetitive edits or checks so reviewers can rerun them.
- **Separate before serializing** `build parallel` - Give concurrent writers separate targets. Lock only for a real invariant.
- **Fix the root cause** `debug` - Fix the first incorrect state, not a later symptom.
- **Attack the premise** `debug` - After two failed fixes, test their shared assumption.
- **Suspect the observation** `debug verify` - Validate a surprising check before changing code.
- **Prove it on the real artifact** `verify` - Exercise and inspect the actual feature, endpoint, CLI, or page.
- **Explain the number** `verify` - State what limits a measurement and rule out misleading conditions.
- **Test behavior, not implementation** `verify build` - Assert observable behavior so refactors do not break the test.
