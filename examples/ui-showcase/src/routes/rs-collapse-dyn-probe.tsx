import { signal } from '@pyreon/reactivity'
import { Button } from '@pyreon/ui-components'

// Canonical DYNAMIC-prop collapsible call sites for the `verify-modes`
// dynamic-collapse cell. Exercises BOTH the no-handler dynamic-collapse
// path (`__rsCollapseDyn`, original PR sequence) AND the handler-combined
// path (`__rsCollapseDynH`, handler-combined follow-up):
//
//   <Button state={cond ? 'a' : 'b'} size="medium">Dyn</Button>          → __rsCollapseDyn
//   <Button state={cond ? 'a' : 'b'} size="medium" onClick={h}>Dyn</Button> → __rsCollapseDynH
//
// One probe file × two distinct fingerprintable shapes in the SAME route
// chunk lets the cell's smoke assertion gate both code paths via one
// build. The compiler scan + resolver emits the SAME 2 expanded
// CollapsibleSite entries per ternary regardless of handlers — handlers
// are orthogonal to the SSR-resolved styler class — so both shapes
// share the same pre-resolved class set. The runtime helper is the only
// delta: `__rsCollapseDyn(html, classes, valueIndex, isDark)` vs
// `__rsCollapseDynH(html, classes, valueIndex, isDark, handlers)`.
//
// The signal-driven `isPrimary` is reactive — clicking the toggle flips
// `state` between `'primary'` and `'secondary'` and both runtime helpers
// patch className IN PLACE on the SAME node (no remount), preserving
// Pyreon's reactive contract. The `__rsCollapseDynH` variant ALSO
// re-attaches the onClick after the class dispatch, byte-identical to
// what the 5-layer mount would emit.
const isPrimary = signal(true)
let combinedClicks = 0

export default function RsCollapseDynProbe() {
  return (
    <div data-testid="rs-collapse-dyn-probe">
      {/* No-handler — emits __rsCollapseDyn */}
      <Button state={isPrimary() ? 'primary' : 'secondary'} size="medium">
        Dyn
      </Button>

      {/* Handler-combined — emits __rsCollapseDynH (handler-combined follow-up).
        * Distinct children text 'DynH' lets the smoke assertion target THIS
        * chunk's handler-combined emit specifically (vs the no-handler
        * 'Dyn' baked template above). */}
      <Button
        state={isPrimary() ? 'primary' : 'secondary'}
        size="medium"
        onClick={() => combinedClicks++}
      >
        DynH
      </Button>

      <button
        type="button"
        data-testid="rs-collapse-dyn-toggle"
        onClick={() => isPrimary.set(!isPrimary())}
      >
        Toggle
      </button>
    </div>
  )
}
