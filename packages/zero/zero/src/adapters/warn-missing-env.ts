import type { AdapterRevalidateResult } from '../types'

/**
 * M2.4 — Loud first-call warning for missing adapter env vars.
 *
 * Pre-M2.4 the adapter `revalidate()` methods returned `{ regenerated: false }`
 * silently in production when required env vars were missing. The dev-mode
 * warning was gated on `process.env.NODE_ENV !== 'production'` — exactly the
 * env condition that DEPLOYED apps run under, where users would most need
 * the signal. Symptom: CMS triggers `adapter.revalidate(path)`, nothing
 * happens, no console output, no failure mode reported back to the
 * triggering webhook handler. The bug only surfaces when someone notices
 * stale content.
 *
 * Fix: warn ALWAYS (regardless of NODE_ENV) on the FIRST invocation per
 * `(adapterName + varSet)` combination. Dedupe via a module-level Set so
 * a busy revalidation handler doesn't spam logs — one warn per process
 * per missing-env-set is enough to expose the misconfiguration.
 *
 * Returns the canonical `{ regenerated: false }` so adapters can write
 * `return warnMissingEnv(...)` as a one-liner.
 *
 * @internal Exposed for unit tests via `_internal.warnMissingEnv` (not yet wired) + `_warnedKeys` reset.
 */
const _warnedKeys = new Set<string>()

export function warnMissingEnv(
  adapterName: string,
  missingVars: readonly string[],
  hint: string,
): AdapterRevalidateResult {
  const key = `${adapterName}:${missingVars.join(',')}`
  if (!_warnedKeys.has(key)) {
    _warnedKeys.add(key)
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] ${adapterName}Adapter.revalidate() needs ${missingVars.join(' + ')} env var(s). ${hint}`,
    )
  }
  return { regenerated: false }
}

/**
 * Reset the dedup Set. Test-only — production code never reaches this.
 * @internal
 */
export function _resetWarnedKeys(): void {
  _warnedKeys.clear()
}
