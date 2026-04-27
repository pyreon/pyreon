import { h } from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import * as runtimeDom from '@pyreon/runtime-dom'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import type { MountInBrowserResult } from '@pyreon/test-utils/browser'
import { transformJSX } from '../../jsx'

/**
 * Compiler-runtime test harness.
 *
 * Bridges the gap between the compiler's unit tests (which assert on the
 * generated source string) and the e2e tests (which exercise full apps).
 * The unit tests in `jsx.test.ts` proved each of PR #352's 4 silent
 * compiler bugs produced syntactically valid output; nothing in the unit
 * suite caught that the output was *behaviorally* wrong. This layer
 * compiles a JSX snippet through the real compiler, drops it into a real
 * Chromium DOM, and asserts observable behavior — events fire, signals
 * propagate, props reflect on the right DOM channel.
 *
 * ## How it works
 *
 * 1. Wrap the snippet as `function App(props) { return ${jsxExpr} }`
 *    so the compiler emits a `function` declaration with a return.
 * 2. `transformJSX(source)` produces JS that imports specific helpers
 *    (`_tpl`, `_bind`, `_bindDirect`, `_bindText`, etc.) from
 *    `@pyreon/runtime-dom`.
 * 3. Strip the import statement and the `export` keyword.
 * 4. Build a `new Function(...args, code)` whose parameter list is the
 *    union of every runtime-dom export plus the keys of the test's
 *    `context` object (signals, event handlers). The compiled code uses
 *    those names directly and `new Function` resolves them via the
 *    closure-like parameter binding.
 * 5. Invoke the factory to get the `App` component back, then render
 *    via `h(App)` + `mountInBrowser`.
 *
 * ## Why not Vite / esbuild bundling
 *
 * The previous bundle-level treeshake tests (in `flow`, `runtime-dom`,
 * `styler`) use `vite.build()` — that's the right tool for asserting
 * tree-shaking but each invocation costs 100-500ms. This harness needs
 * to scale to ~50 tests in Phase B2; the `new Function` path runs in
 * single-digit ms per test.
 *
 * ## Caveats
 *
 * - Snippets must be self-contained JSX expressions (no external imports).
 * - All non-runtime-dom symbols (signals, handlers, components) must be
 *   passed in via the `context` parameter.
 * - The compiler is invoked in JS-fallback mode if the native binary isn't
 *   available — same as the rest of the test suite.
 */
export function compileAndMount(
  jsxExpr: string,
  context: Record<string, unknown> = {},
): MountInBrowserResult {
  // Wrap as a function so the compiler emits a return statement.
  const source = `export function App(props) { return ${jsxExpr} }`
  const compiled = transformJSX(source, 'compile-runtime-test.tsx').code

  // Strip ALL `@pyreon/*` imports — we inject the symbols by name
  // through `new Function` parameters instead. Both runtime-dom and
  // reactivity exports are unioned in below, so any compiler-emitted
  // import (`_tpl`, `_bind`, `_bindDirect`, `_bindText`, `_applyProps`,
  // etc.) resolves through the parameter binding. Strip the `export`
  // keyword so `App` is in factory scope.
  const code = compiled
    .replace(/^\s*import\s*\{[^}]+\}\s*from\s*["']@pyreon\/[^"']+["'];?\s*$/gm, '')
    .replace(/export\s+function\s+App/, 'function App')

  // Union of runtime-dom + reactivity exports + test-supplied context,
  // fed into the factory's parameter list. The compiled code uses these
  // names directly (e.g. `_tpl(...)`, `_bind(...)`, `sig.set(...)`) —
  // `new Function` binds them via closure-equivalent parameter resolution.
  // Same-name overrides resolve in declaration order: later wins. We put
  // user-supplied context LAST so a test can shadow a runtime export if
  // it ever needs to (rare).
  const runtimeKeys = Object.keys(runtimeDom)
  const reactivityKeys = Object.keys(reactivity).filter((k) => !runtimeKeys.includes(k))
  const contextKeys = Object.keys(context).filter(
    (k) => !runtimeKeys.includes(k) && !reactivityKeys.includes(k),
  )
  const allKeys = [...runtimeKeys, ...reactivityKeys, ...contextKeys]
  const allValues = [
    ...runtimeKeys.map((k) => (runtimeDom as Record<string, unknown>)[k]),
    ...reactivityKeys.map((k) => (reactivity as Record<string, unknown>)[k]),
    ...contextKeys.map((k) => context[k]),
  ]

  // eslint-disable-next-line no-new-func
  const factory = new Function(...allKeys, `${code}\nreturn App`)
  const App = factory(...allValues) as (props: object) => unknown

  return mountInBrowser(h(App as never, {}) as never)
}
