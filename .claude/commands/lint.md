Run linting, formatting and type checking.

Steps:

1. `bun run lint` (oxlint)
2. `bun run format:check` (oxfmt)
3. `bun run lint:pyreon` (Pyreon's own rules — the `Pyreon Lint Gate` CI check)
4. `bun run typecheck`
5. If $ARGUMENTS contains `--fix`, run `bunx oxlint --fix .` and `bunx oxfmt --write .` first.
6. Report remaining errors with `file:line`.
