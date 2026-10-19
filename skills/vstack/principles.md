# Principles

Each line: name, the steps it applies to, the rule. `vstack` prints the matching lines in a step, once per task. Edit freely. Keep the format `- **Name** `tags` - rule`.

- **Data shape first** `design build` - Name the data and its structure before logic. A state machine, union, or table beats scattered branches.
- **Illegal states unrepresentable** `design` - Types forbid invalid states. Validate once at the system edge, then trust the data. No casts.
- **Redesign, don't bolt on** `design` - Fit the requirement into the design. No special case.
- **Deep over shallow** `design` - One useful interface, not thin layers or one-caller wrappers.
- **Two designs when there is no precedent** `design` - Sketch two structures, then pick one.
- **Idempotent operations** `design` - Retries converge on the same result.
- **Separate before serializing** `design` - Concurrent writers get separate targets. Lock only for a real invariant.
- **Subtract before adding** `build` - Delete dead and speculative code first, then build on the simpler base.
- **One source of truth** `build` - Decide each thing in one place and pass the result.
- **Migrate, then delete** `build` - A new API moves every caller and deletes the old one in the same change.
- **Comments only for why** `build` - Comment only a reason the code cannot show.
- **Build the lever** `build` - Script repetitive edits or checks so a reviewer can rerun them.
- **Test behavior, not implementation** `build` - Assert what callers observe, so refactors keep tests green.
- **Fix the root cause** `debug` - Fix the first wrong state, not a later symptom.
- **Attack the premise** `debug` - After two failed fixes, test their shared assumption.
- **Suspect the observation** `debug verify` - Check a surprising result (stale build, wrong env, cache) before changing code.
- **Explain the number** `verify` - Name what limits a measurement and rule out misleading conditions.
