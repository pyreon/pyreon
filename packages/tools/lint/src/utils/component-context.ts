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

  function nameOfFunction(node: any, parent: any): string | null {
    // function Foo() {} / function useFoo() {}
    if (node.type === 'FunctionDeclaration') return node.id?.name ?? null

    // const Foo = () => {} / const useFoo = () => {}
    // const Foo = function () {}
    if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
      return parent.id.name
    }

    // export default function Foo() {} / export default function useFoo() {}
    // (handled by FunctionDeclaration above when name is present)

    return null
  }

  function maybeEnter(node: any, parent: any) {
    if (isComponentOrHookName(nameOfFunction(node, parent))) depth++
  }
  function maybeExit(node: any, parent: any) {
    if (isComponentOrHookName(nameOfFunction(node, parent))) depth--
  }

  return {
    isInComponentOrHook: () => depth > 0,
    callbacks: {
      FunctionDeclaration: maybeEnter,
      'FunctionDeclaration:exit': maybeExit,
      FunctionExpression: maybeEnter,
      'FunctionExpression:exit': maybeExit,
      ArrowFunctionExpression: maybeEnter,
      'ArrowFunctionExpression:exit': maybeExit,
    },
  }
}
