Run the full validation pipeline before pushing.

Steps:
1. Run `bun run lint` — report any lint errors
2. Run `bun run typecheck` — report any type errors (ignore MCP TS2589 pre-existing)
3. Run `bun run test` — report any test failures
4. If all pass, report "All checks pass ✓"
5. If any fail, report the specific errors with file:line references and suggest fixes
