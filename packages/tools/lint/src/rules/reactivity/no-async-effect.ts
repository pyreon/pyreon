import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'

/**
 * Disallow async functions passed to `effect()` (audit bug #1).
 *
 * The reactivity tracking context is the SYNCHRONOUS frame around the
 * effect callback's top half. Anything after the first `await` runs
 * detached, so signal reads on the back side aren't tracked and the
 * effect won't re-run when those signals change. Common foot-gun:
 *
 *   effect(async () => {
 *     const id = userId()           // tracked ✓
 *     const data = await fetch(...) // boundary
 *     const name = profile()        // NOT tracked ✗ — runs once, never again
 *     setName(name)
 *   })
 *
 * The `effect()` runtime emits a dev-mode console.warn for the same
 * shape (see `packages/core/reactivity/src/effect.ts`); this lint rule
 * surfaces the warning earlier in the editor / CI loop, before the code
 * even runs.
 *
 * Mitigation patterns:
 *   - Read all tracked signals BEFORE any await, then `await` last.
 *   - Use `watch(source, async (val) => …)` — the source is tracked
 *     synchronously; the async callback runs on changes without
 *     needing tracking continuity.
 *   - Split into two effects: one synchronous (track + dispatch), one
 *     async via the dispatch.
 */
export const noAsyncEffect: Rule = {
  meta: {
    id: 'pyreon/no-async-effect',
    category: 'reactivity',
    description:
      'Disallow async functions in `effect()` — signal reads after the first await are not tracked.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        // Only flag direct `effect(...)` calls. Renamed imports
        // (`import { effect as fx }`) skip; the rule errs toward
        // false negatives over false positives.
        if (!isCallTo(node, 'effect')) return
        const arg = node.arguments?.[0]
        if (!arg) return
        // ArrowFunctionExpression and FunctionExpression both carry
        // `async: true` when authored as `async () => …` or
        // `async function () { … }`. Other arg shapes (named function
        // refs, identifiers, calls) are ambiguous statically — skip.
        if (
          (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') &&
          arg.async === true
        ) {
          context.report({
            message:
              'effect() callback is async — signal reads after the first `await` are NOT tracked. Read all tracked signals before any await, or use `watch(source, asyncCb)` for async-in-callback patterns.',
            span: getSpan(arg),
          })
        }
      },
    }
    return callbacks
  },
}
