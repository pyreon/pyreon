import { Button } from '@pyreon/ui-components'

// Canonical collapsible call site for the `verify-modes` collapse cell.
//
// Every dimension prop is a string literal, there is no `{...spread}`,
// children are static text, and crucially there is NO `onClick` — so the
// `@pyreon/vite-plugin` collapse scan + the programmatic Vite-SSR
// resolver fire during a real production `vite build` and the compiler
// emits ONE `__rsCollapse(...)` (plus a once-per-module idempotent
// `__rsSheet.injectRules(...)`) instead of the 5-layer rocketstyle
// wrapper mount. The rest of `examples/ui-showcase`'s Buttons all carry
// `onClick` and correctly BAIL — this dedicated route is what makes the
// build-artifact gate exercisable.
//
// Formatting is irrelevant: `detectCollapsibleShape` concatenates the
// JSXText children and `.trim()`s, so `<Button>…\n  Save\n</Button>`
// resolves `childrenText === "Save"` exactly like the single-line form
// (verified against `packages/core/compiler/src/jsx.ts:detectCollapsibleShape`).
// The SSR→hydrate path for the collapsed output is proven separately by
// the e2 `SSR markup → hydrateRoot(_rsCollapse)` spec.
export default function RsCollapseProbe() {
  return (
    <Button state="primary" size="medium">
      Save
    </Button>
  )
}
