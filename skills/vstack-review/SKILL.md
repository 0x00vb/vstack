---
name: vstack-review
description: Fresh-context adversarial review of a diff, optionally across models, with triage by a lead. Use for the vstack review step, "review this", "challenge this", "tear this apart", or before shipping contested work.
---

# vstack review

1. **Prompt.** `vstack brief --review` prints a self-contained reviewer prompt: intent, criteria, rubric, and the diff. It works without an active task (diff against the base branch).
2. **Reviewer.** The reviewer must not share your context.
   - If you can spawn subagents, spawn one read-only and give it the prompt verbatim.
   - For size L or contested work, also run a second model through another agent's CLI, in a different model family from the one that wrote the code:
     - `vstack brief --review | codex exec -`
     - `vstack brief --review | claude -p`
     - `vstack brief --review | cursor-agent -p`
   - If you have neither, re-read the diff cold with the prompt's rubric before you do anything else.
3. **Triage.** You are the lead, not an aggregator. Put every finding in one bucket with a one-line reason:
   - **Act on.** It would block a real PR: correctness, security, data loss, maintainability.
   - **Consider.** Legitimate, but maybe not worth it now. The user decides.
   - **Noted.** Valid but not actionable.
   - **Dismissed.** Wrong or missing context. Say why.
   A finding two models raised independently is the strongest signal.
4. **Fix** the act-on items only. If code changed, run `vstack back verify "<why>"`. Do not churn code over nitpicks.

Report: intent, reviewers (model, finding count), act on, consider, noted, dismissed, and where the models agreed.
