---
'@pyreon/lint': minor
---

New rule `pyreon/no-heavy-import-only-in-handler` (performance, warn).

Flags a statically-imported heavy module (`@pyreon/charts` / `code` / `flow` / `document`, plus any extra modules configured via the `heavyModules` option) that is referenced **only** inside deferred scopes — JSX `on*` event handlers or `onMount` / `onUnmount` / `onCleanup` lifecycle callbacks. The static `import` forces the heavy chunk into the initial bundle even though nothing touches it until the user interacts; the fix is a dynamic `await import()` inside the handler.

```tsx
// ✗ flagged — @pyreon/charts only used in a click handler
import { renderChart } from '@pyreon/charts'
<button onClick={() => renderChart(el)}>Show chart</button>

// ✓ heavy chunk stays out of the initial bundle
<button onClick={async () => {
  const { renderChart } = await import('@pyreon/charts')
  renderChart(el)
}}>Show chart</button>
```

The precise, actionable counterpart to the blunt info-level `pyreon/no-eager-import` (which fires on every heavy static import including ones genuinely needed at render). This rule fires only when **every** reference is provably deferred, so the recommended fix is unambiguous. Conservative by construction: any eager reference at all — a `<Chart/>` JSX element, a module-eval `const x = heavy`, a plain helper called at render — suppresses the report (a false negative is acceptable; telling someone to defer an import they need at render is not).

`effect` / `renderEffect` are deliberately **not** treated as deferred: their callbacks run synchronously during component setup, so a heavy module used in an effect body is a render-time dependency, not a deferrable one.

Rule count 67, performance category 5. No breaking changes.
