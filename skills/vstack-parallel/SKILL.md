---
name: vstack-parallel
description: Run several coding agents on one repo at once without collisions or slop, using one worktree per task, written briefs, the vstack board, and cross-model verification. Use for "run these in parallel", fanning out work, or managing many agents.
---

# vstack parallel

1. **One task, one worktree, one branch, one agent.** `git worktree add ../<repo>-<id> -b <id>`, then start the agent there. It runs its own `vstack start`. Never point two agents at one worktree.
2. **Split before you parallelize.** Tasks that would write the same files run in sequence, or you split the file first. Parallelize only disjoint files, services, or layers.
3. **The brief is the product.** A worker cannot ask you questions. `vstack brief` gives the skeleton: fill GOAL, SCOPE, ACCEPT, VERIFY, FORBIDDEN, and REPORT completely. A field you cannot fill means the task is not scoped yet.
4. **Watch with `vstack board`.** It lists every task across all worktrees of the repo. `!` means no step change in two hours, so check that agent.
5. **Verify with a different model than the builder.** Review each branch before it merges (vstack-review). Merge in dependency order and rebase the rest. A rebase changes the diff, so the verify gate runs again.
6. **Report in aggregate.** For each task: step, evidence, open decisions. Never forward raw agent output.

Run only as many agents as you can actually review. Throughput without review is how slop ships.
