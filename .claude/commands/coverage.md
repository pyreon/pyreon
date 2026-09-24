Run test coverage and report a summary table.

Steps:

1. With no arguments, run `bun run coverage` (`scripts/check-coverage.ts`, the same check as the `Coverage (Full)` CI job). It prints a per-package table and exits non-zero when a package is below its configured threshold.
2. If $ARGUMENTS names a package, run only that one: `bun run --filter='@pyreon/<name>' test -- --coverage`.
3. Report statements, branches, functions and lines per package as a markdown table sorted by package name.
4. Flag any metric below the package's enforced threshold: `CATEGORY_DEFAULTS` in `packages/internals/vitest-config/src/thresholds.ts` (core and internals 90%, fundamentals 85/80/85/85, ui, tools and zero 80/75/80/80), with per-package overrides in each `vitest.config.ts`. `scripts/check-coverage.ts` also applies a stricter floor with listed exemptions.
5. A package reporting `0/0` measured nothing (usually its code is a re-export barrel excluded from coverage) — report it as unmeasured, not as 0%.
