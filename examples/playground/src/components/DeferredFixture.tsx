/**
 * Fixture component used by the inline-Defer verify-modes cell.
 *
 * Two fingerprints live here:
 *   - `DEFER_INLINE_FIXTURE_MARKER_XYZ123` — chunk-extraction proof. Must
 *     appear in `DeferredFixture-*.js` only.
 *   - `DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987` — the prop literal passed
 *     from `About.tsx`'s call site. Must appear in the route chunk
 *     (`about-*.js`) because the render-prop body lives in the caller —
 *     `{(__C) => <__C label="DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987" />}`.
 *
 * The two-fingerprint shape proves v2's prop-preservation works at
 * build-time: if the compiler rewrote the inline child but DROPPED the
 * prop, the prop-fingerprint would land neither in the route chunk
 * (rendered body has no `label` literal) nor in the fixture chunk
 * (component doesn't carry the literal). verify-modes catches that.
 */
export function DeferredFixture(props: { label: string }): JSX.Element {
  return (
    <div data-testid="deferred-fixture">
      DEFER_INLINE_FIXTURE_MARKER_XYZ123: <span data-testid="deferred-label">{props.label}</span>
    </div>
  )
}
