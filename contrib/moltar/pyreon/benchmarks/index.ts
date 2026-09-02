/**
 * LOCAL SHIM — not part of the submission.
 *
 * Upstream, `cases/pyreon.ts` imports `createCase` from `../benchmarks`, which
 * is moltar's own registry (`benchmarks/helpers/register.ts`). This file stands
 * in for it so the case file is IMPORTABLE in this repo and its four
 * implementations can be tested against moltar's own expectations BEFORE the
 * file is submitted — rather than discovering a contract mismatch in someone
 * else's CI.
 *
 * It deliberately mirrors only the surface `cases/pyreon.ts` touches. Copy
 * `cases/pyreon.ts` upstream; do NOT copy this directory.
 */

export type BenchmarkId =
  | 'parseSafe'
  | 'parseStrict'
  | 'assertLoose'
  | 'assertStrict'

export type CaseFn = (data: unknown) => unknown

const registry = new Map<BenchmarkId, { module: string; fn: CaseFn }>()

export function createCase(
  moduleName: string,
  benchmarkId: BenchmarkId,
  factory: () => CaseFn,
): void {
  registry.set(benchmarkId, { module: moduleName, fn: factory() })
}

/** Test-only accessor; upstream has no equivalent. */
export function registeredCases(): Map<
  BenchmarkId,
  { module: string; fn: CaseFn }
> {
  return registry
}
