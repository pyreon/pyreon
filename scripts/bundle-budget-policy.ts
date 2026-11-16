/**
 * bundle-budget-policy — `--update` flag parsing shared by the size gates. The
 * verdict and ceiling rules are in `size-budget-policy.ts`.
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
