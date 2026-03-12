Run tests for a specific package or all packages.

Usage:
- `/test` — run all package tests
- `/test reactivity` — run tests for a specific package
- `/test runtime-dom --coverage` — run with coverage

Steps:
1. If a package name is provided as $ARGUMENTS, run `cd packages/$ARGUMENTS && bun run test`
2. If `--coverage` flag is present, append `-- --coverage` to the command
3. If no arguments, run `bun run test` from the project root
4. Report any failures clearly with the test name and error
