import { signal } from '@pyreon/reactivity'
import { Button } from '@pyreon/ui-components'

// Canonical DYNAMIC-prop collapsible call site for the `verify-modes`
// dynamic-collapse cell (PR 4 of the dynamic-prop partial-collapse build).
//
// The `state` prop is a ternary-of-two-literals — `state={isPrimary() ? 'primary' : 'secondary'}`.
// Every OTHER dim prop is a string literal, there is no `{...spread}`,
// children are static text, and crucially there is NO `onClick` — so the
// `@pyreon/vite-plugin` collapse scan (PR 3) detects the dynamic shape,
// the programmatic Vite-SSR resolver pre-renders BOTH literal values
// (`state="primary"` and `state="secondary"`), and the compiler emits
// ONE `__rsCollapseDyn(html, [pri_L, pri_D, sec_L, sec_D], () =>
// (isPrimary()) ? 0 : 1, () => __pyrMode() === "dark")` (plus the
// once-per-module idempotent `__rsSheet.injectRules(...)` unioning both
// values' rule bundles) instead of the 5-layer rocketstyle wrapper
// mount.
//
// Without the dynamic-prop path (i.e. with PR 3 reverted) this shape
// FALLS through to the normal rocketstyle mount — the existing full +
// partial detectors both bail on a non-literal dim prop. The cell's
// smoke (`assertDynProbeCollapsed`) asserts the chunk shows the
// dynamic-emit fingerprints; with the dispatch absent it would throw.
//
// The signal-driven `isPrimary` is reactive — clicking the toggle
// flips `state` between `'primary'` and `'secondary'` and the runtime
// `_rsCollapseDyn` patches className IN PLACE on the SAME node (no
// remount), preserving Pyreon's reactive contract. The e2e gate
// exercises this end-to-end.
const isPrimary = signal(true)

export default function RsCollapseDynProbe() {
  return (
    <div data-testid="rs-collapse-dyn-probe">
      <Button state={isPrimary() ? 'primary' : 'secondary'} size="medium">
        Dyn
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
