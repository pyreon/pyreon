/**
 * bundle-budget-policy — the pure decision logic behind `check-bundle-budgets`.
 *
 * Lives apart from the gate itself because the gate measures with `Bun.build`,
 * and `Bun` is not in the type surface of every program that wants to TEST this
 * logic: `@pyreon/test-utils` extends `@pyreon/tsconfig/internal.json`, whose
 * `types` are `["vitest/globals", "node"]` — no `bun`. Importing the gate from a
 * test there drags `Bun.build` into that program and fails typecheck, which is
 * exactly what happened. The same split is why `scripts/is-entry.ts` and
 * `scripts/test-paths.ts` exist: a policy a test needs must not carry a runtime
 * dependency the test's program cannot type.
 *
 * Nothing here touches the filesystem, argv, or a bundler — so it is testable
 * without a build tree, and importable from any tsconfig.
 */

/**
 * Should an UNSCOPED `--update` lower this budget?
 *
 * No — never. A budget is measured from `lib/`, and a stale or partial `lib/`
 * measures SMALLER than the real package, so a bad measurement can only ever
 * push a budget DOWN. That is the whole observed failure: `@pyreon/validate` was
 * ratcheted 15872 -> 15360, a value implying a ~12288 B measurement for a package
 * that really measures 15330 B locally (after a bootstrap) and 15473 B on CI. The
 * budget landed BELOW what CI measures, so the gate failed on a package neither
 * branch touched — twice, because the wrong value was committed and travelled.
 *
 * Refusing by DIRECTION rather than by drop size is what makes this correct. A
 * size threshold cannot tell a stale build from a genuinely loose budget, and
 * this repo has plenty of the latter — `loom` measures 298 B against 6144,
 * `testing` 1745 against 5120, both identical before and after a full rebuild.
 * Blocking those would refuse legitimate tightening while still missing a small
 * stale drop.
 *
 * Tightening stays available and becomes a deliberate act: `--update=@pyreon/pkg`
 * lowers, and naming the package is the review signal.
 */
export function shouldLowerUnscoped(scoped: boolean): boolean {
  return scoped
}

/**
 * Does this argv enable `--update`?
 *
 * Both the bare flag and the documented scoped form `--update=@pyreon/pkg`. An
 * `includes('--update')` exact match silently missed the scoped form, so it ran
 * as a plain check for its whole life — latent until lowering became
 * scoped-only.
 */
export function isUpdateMode(args: readonly string[]): boolean {
  return args.some((a) => a === '--update' || a.startsWith('--update='))
}
