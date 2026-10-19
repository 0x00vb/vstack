# vstack parallel

1. One task, one worktree, one branch, one agent: `git worktree add ../<repo>-<id> -b <id>`. The agent runs its own `vstack start` there.
2. Parallelize only disjoint files, services, or layers. Tasks that write the same files run in sequence.
3. A worker cannot ask questions. Fill every field of `vstack brief`. A field you cannot fill means the task is not scoped yet.
4. Watch with `vstack board`. `!` marks a task with no step change in two hours.
5. Review each branch with a different model than its builder ([review.md](review.md)). Merge in dependency order, then rebase the rest. A rebase changes the diff, so verify runs again.
6. Report per task: step, evidence, open decisions. Never forward raw agent output.

Run only as many agents as you can review.
