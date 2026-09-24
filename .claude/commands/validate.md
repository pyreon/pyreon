Run the validation pipeline before pushing.

Steps:

1. `bun run validate-fast` — lint plus the cheap CI gates (docs sync, doc claims, changeset, budgets, distribution, release readiness, ratchets…).
2. `bun run lint:pyreon`
3. `bun run --filter=<affected> typecheck` and `bun run --filter=<affected> test`, with the affected set from `bun scripts/affected.ts` (a root-file change means `--filter=*`).
4. If all pass, report "All checks pass ✓".
5. If any fail, report each error with `file:line` and the fix from `.agents/rules/workflow.md` ("Recurring CI failure modes").
