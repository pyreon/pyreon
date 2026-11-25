/** Environment-variable parsing shared by the plugin. */

/**
 * Truthy env-var parser. Accepts `1` / `true` / `yes` / `on`
 * (case-insensitive). Returns `false` for `undefined`, empty string,
 * `0`, `false`, `no`, `off`, or any unrecognized value.
 *
 * Exported via `@pyreon/vite-plugin/internal` for unit-testability — the previous strict
 * `=== '1'` shape caught a user reporting `PYREON_DISABLE_DEDUPE=true`
 * silently not working. Env-var hatches are usually reached for under
 * stress; rejecting alternatives is exactly the wrong moment to be strict.
 *
 * @internal
 */
export function _isTruthyEnv(v: string | undefined): boolean {
  if (v === undefined) return false
  const lower = v.toLowerCase()
  return lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on'
}
