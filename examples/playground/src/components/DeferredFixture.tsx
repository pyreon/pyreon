/**
 * Fixture component used by the inline-Defer verify-modes cell.
 *
 * The string `DEFER_INLINE_FIXTURE_MARKER_XYZ123` is a unique fingerprint
 * — verify-modes greps for it in `dist/assets/*.js` to confirm:
 *   1. It DOES appear in exactly one chunk (the deferred chunk that the
 *      inline-Defer compiler pass extracted)
 *   2. It does NOT appear in the entry chunk (otherwise the compiler
 *      didn't actually split — it would be a no-op transform)
 *
 * The component itself is intentionally minimal — only the fingerprint
 * matters for the bundle-graph assertion.
 */
export function DeferredFixture(): JSX.Element {
  return <div data-testid="deferred-fixture">DEFER_INLINE_FIXTURE_MARKER_XYZ123</div>
}
