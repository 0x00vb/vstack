# vstack review

1. Run `vstack brief --review`. It prints the intent, the criteria, the rubric, and the full diff with untracked files. With no task, it diffs against the base branch.
2. Give that output, verbatim, to a reviewer that does not share your context:
   - a read-only subagent, on a different or smaller model when you can choose, or
   - another agent's CLI: `vstack brief --review | codex exec -`, `| claude -p`, or `| cursor-agent -p`.
   For size L or contested work, use two reviewers from different model families. With neither option, re-read the diff cold against the rubric.
3. Triage each finding with a one-line reason: **act on** (blocks a real PR), **consider** (the user decides), **noted**, or **dismissed** (say why). A finding that two models raise on their own is the strongest signal.
4. Fix the act-on items only. If code changed, run `vstack back verify "<why>"`.

Report: reviewers (model, finding count), then act on, consider, dismissed.
