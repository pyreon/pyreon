Run test coverage for all packages and report a summary table.

Steps:

1. For each package in packages/\*, run `bun run test -- --coverage` and capture the output
2. Parse the coverage summary (statements, branches, functions, lines) from each
3. Present results as a markdown table sorted by package name
4. Flag any metric below 95% with a warning
5. If $ARGUMENTS contains a package name, only run coverage for that package
