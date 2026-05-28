import { Button } from '@pyreon/ui-components'

// Canonical ELEMENT-CHILD collapsible call site for the `verify-modes`
// collapse cell (element-child collapse PR 3 build-artifact gate).
//
// Every dimension prop is a string literal, there is no `{...spread}`, no
// `onClick`, and the child is a RECURSIVELY-STATIC element subtree
// (`<span class="elemico">ElemSave</span>` — lowercase DOM tag, literal
// attrs, static text, no handlers). So `detectElementChildCollapsibleShape`
// matches, the `@pyreon/vite-plugin` collapse scan expands the site into
// the resolve set carrying its `childTree`, the programmatic Vite-SSR
// resolver rebuilds the REAL child VNodes via `h()` and bakes the FULL
// subtree HTML, and the compiler emits the UNCHANGED `__rsCollapse(...)`
// (NO new runtime helper — the cloned `_tpl` already carries the child).
//
// The distinctive `elemico` class + `ElemSave` text are the
// minification-stable fingerprints the gate asserts: a collapsed chunk
// bakes `<span class="elemico">ElemSave…` INTO the `__rsCollapse` template
// literal. A flatten-bug (child rendered as text, not as an element) would
// drop the `<span class="elemico">` wrapper; a collapse-OFF build keeps the
// 5-layer wrapper mount and emits no `=== "dark"` mode accessor. The
// resolver's `buildChildVNodes` reconstruction is proven in isolation by
// the real-Vite-SSR specs in `rocketstyle-collapse.test.ts`; this route
// proves the fully-assembled production artifact.
export default function RsCollapseElemProbe() {
  return (
    <Button state="primary" size="medium">
      <span class="elemico">ElemSave</span>
    </Button>
  )
}
