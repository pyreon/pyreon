/**
 * Component / hook scope tracker for lint rules.
 *
 * Many rules in this package only matter *inside* a component or hook —
 * e.g. `no-raw-setinterval` wants you to wrap timers in `onMount` so they
 * are cleaned up when the component unmounts. A `setInterval` at module
 * scope, in a utility function, or inside a test callback has its own
 * lifecycle and doesn't need component-tied cleanup.
 *
 * Previously these rules used a path-string `isTestFile()` skip as a
 * proxy for "outside component context". That's a heuristic — it
 * accidentally exempts test files where the pattern *is* still wrong,
 * and it accidentally fires on utility/library files where the pattern
 * is fine.
 *
 * This tracker maintains a "component depth" counter via visitor
 * callbacks. A function counts as a component or hook when its name
 * follows the framework's naming conventions:
 *   - `MyThing` (PascalCase) → component
 *   - `useThing` (camelCase, `use` prefix + uppercase next char) → hook
 *
 * Rules consume it via `createComponentContextTracker()` and merge the
 * returned `callbacks` into their visitor:
 *
 *   ```ts
 *   create(context) {
 *     const ctx = createComponentContextTracker()
 *     return {
 *       ...ctx.callbacks,
 *       CallExpression(node) {
 *         if (!ctx.isInComponentOrHook()) return
 *         // ... existing rule logic ...
 *       },
 *     }
 *   }
 *   ```
 *
 * The tracker also recognizes named arrow / function expressions assigned
 * to `const X = (props) => …`, since the framework treats those as
 * components too. Anonymous callbacks (e.g. `it('...', () => { … })`,
 * `setTimeout(() => { … }, 0)`, `arr.map(x => x)`) never push depth — so
 * test bodies, IIFEs, and inline callbacks are correctly seen as
 * "outside any component" without needing a path-based skip.
 */

import type { VisitorCallbacks } from '../types'

const COMPONENT_NAME = /^[A-Z]/
const HOOK_NAME = /^use[A-Z]/

export function isComponentOrHookName(name: string | null | undefined): boolean {
  if (!name) return false
  return COMPONENT_NAME.test(name) || HOOK_NAME.test(name)
}

export interface ComponentContextTracker {
  /** True iff the current AST position is inside a function recognised as a component or hook. */
  isInComponentOrHook(): boolean
  /**
   * Visitor callbacks that maintain the depth counter. Spread them into the
   * rule's returned visitor first; per-node listeners after override only
   * the keys the rule itself implements (FunctionDeclaration etc. rarely).
   */
  callbacks: VisitorCallbacks
}

export function createComponentContextTracker(): ComponentContextTracker {
  let depth = 0

  // For arrow / function expressions assigned to a `const X = (...) => …`,
  // we can't read the binding name from the function node — and the oxc
  // visitor doesn't pass `parent` to callbacks. Instead, hook the parent
  // `VariableDeclarator` enter/exit: it visits BEFORE its `init` child
  // (the function expression) and EXITS AFTER, so a depth bump tied to
  // the declarator correctly brackets the function body.
  function declaratorIsComponentOrHook(node: any): boolean {
    if (node?.id?.type !== 'Identifier') return false
    const init = node.init
    if (
      init?.type !== 'ArrowFunctionExpression' &&
      init?.type !== 'FunctionExpression'
    )
      return false
    return isComponentOrHookName(node.id.name)
  }

  return {
    isInComponentOrHook: () => depth > 0,
    callbacks: {
      // function MyComp() {} / function useFoo() {}
      FunctionDeclaration(node: any) {
        if (isComponentOrHookName(node.id?.name)) depth++
      },
      'FunctionDeclaration:exit'(node: any) {
        if (isComponentOrHookName(node.id?.name)) depth--
      },
      // const MyComp = () => {} / const useFoo = function () {}
      VariableDeclarator(node: any) {
        if (declaratorIsComponentOrHook(node)) depth++
      },
      'VariableDeclarator:exit'(node: any) {
        if (declaratorIsComponentOrHook(node)) depth--
      },
    },
  }
}
