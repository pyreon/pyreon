import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A `fetch` started in `onMount` with no `AbortController`.
 *
 * The component unmounts before the response lands, the `.then` runs anyway,
 * and it writes into signals belonging to a disposed scope. Two costs: the
 * response and everything downstream of it is retained until it settles (leak
 * class H — a closure holding the component's world), and on a route the user
 * navigates through quickly you accumulate one of these per visit.
 *
 * `onMount` returns its cleanup, so the fix is local:
 *
 *   onMount(() => {
 *     const ac = new AbortController()
 *     fetch(url, { signal: ac.signal }).then(...)
 *     return () => ac.abort()
 *   })
 *
 * Only `fetch` directly inside an `onMount` callback is reported, and only
 * when neither a signal nor an abort appears in that callback.
 */
export const requireAbortOnUnmount: Rule = {
  meta: {
    id: 'pyreon/require-abort-on-unmount',
    category: 'web-perf',
    description:
      'A fetch started in `onMount` with no AbortController keeps running after unmount — its `.then` writes into a disposed scope and retains the component until the response settles.',
    severity: 'warn',
    appliesTo: ['client', 'shared'],
    fixable: false,
  },
  create(context) {
    /** Everything mentioned inside a subtree, as text-ish markers. */
    function mentions(node: any, want: (n: any) => boolean, depth = 0): boolean {
      if (!node || typeof node !== 'object' || depth > 12) return false
      if (want(node)) return true
      for (const k of Object.keys(node)) {
        if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'parent') continue
        const v = (node as Record<string, unknown>)[k]
        if (Array.isArray(v)) {
          for (const c of v) if (mentions(c, want, depth + 1)) return true
        } else if (v && typeof v === 'object' && mentions(v, want, depth + 1)) return true
      }
      return false
    }

    const isFetch = (n: any) =>
      n?.type === 'CallExpression' && n.callee?.type === 'Identifier' && String(n.callee.name) === 'fetch'
    const isAbortish = (n: any) =>
      (n?.type === 'NewExpression' &&
        n.callee?.type === 'Identifier' &&
        String(n.callee.name) === 'AbortController') ||
      (n?.type === 'Identifier' && String(n.name) === 'signal') ||
      (n?.type === 'MemberExpression' &&
        n.property?.type === 'Identifier' &&
        ['abort', 'signal'].includes(String(n.property.name)))

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (node?.callee?.type !== 'Identifier' || String(node.callee.name) !== 'onMount') return
        const cb = (node.arguments ?? [])[0]
        if (!cb || (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression')) return
        if (!mentions(cb.body, isFetch)) return
        if (mentions(cb.body, isAbortish)) return
        context.report({
          message:
            'This `fetch` runs in `onMount` with no AbortController, so an unmount before the response lands does not stop it: the `.then` still runs and writes into a disposed scope, and the whole component stays reachable until the request settles. `onMount` returns its cleanup — create an `AbortController`, pass `{ signal }`, and `return () => ac.abort()`.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
