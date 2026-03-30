Run linting and type checking.

Steps:

1. Run `oxlint .` to lint
2. Run `oxfmt --check .` to check formatting
3. Run `bun run typecheck` for type checking
4. Report any remaining errors clearly
5. If $ARGUMENTS contains `--fix`, run `oxlint --fix .` and `oxfmt --write .`
