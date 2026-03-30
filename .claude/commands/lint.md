Run linting and type checking.

Steps:

1. Run `bunx biome check --write .` to lint and auto-fix
2. Run `bunx tsc --noEmit` for type checking
3. Report any remaining errors clearly
4. If $ARGUMENTS contains `--check` (no auto-fix), run `bunx biome check .` instead
