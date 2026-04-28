import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'

/**
 * Disallow async functions passed to `effect()` / `renderEffect()` /
 * `computed()` (audit bug #1).
 *
 * The reactivity tracking context is the SYNCHRONOUS frame around the
 * callback's top half. Anything after the first `await` runs detached,
 * so signal reads on the back side aren't tracked and the
 * effect/computed won't re-run when those signals change. Common
 * foot-gun:
 *
 *   effect(async () => {
 *     const id = userId()           // tracked ✓
 *     const data = await fetch(...) // boundary
 *     const name = profile()        // NOT tracked ✗ — runs once, never again
 *     setName(name)
 *   })
 *
 * `computed(async () => …)` is even worse: the computed's value type
 * becomes `Computed<Promise<T>>`, which silently breaks every consumer
 * that expects `Computed<T>`. There's no scenario where async makes
 * sense for a computed.
 *
 * The runtime emits a matching dev-mode console.warn for each call
 * shape (see `packages/core/reactivity/src/effect.ts` and
 * `computed.ts`); this lint rule surfaces the warning earlier in the
 * editor / CI loop, before the code even runs.
 *
 * Mitigation patterns:
 *   - Read all tracked signals BEFORE any await, then `await` last.
 *   - Use `watch(source, async (val) => …)` — the source is tracked
 *     synchronously; the async callback runs on changes without
 *     needing tracking continuity.
 *   - Split into two effects: one synchronous (track + dispatch), one
 *     async via the dispatch.
 *   - For async derived state, use `createResource` or a
 *     `signal<Promise<T>>` + `effect` pattern, NOT `computed`.
 */

const REACTIVE_PRIMITIVES = ['effect', 'renderEffect', 'computed'] as const

export const noAsyncEffect: Rule = {
  meta: {
    id: 'pyreon/no-async-effect',
    category: 'reactivity',
    description:
      'Disallow async functions in `effect()` / `renderEffect()` / `computed()` — signal reads after the first await are not tracked.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        // Only flag direct calls. Renamed imports (`import { effect as
        // fx }`) skip; the rule errs toward false negatives over false
        // positives.
        const calleeName = REACTIVE_PRIMITIVES.find((n) => isCallTo(node, n))
        if (!calleeName) return
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
          const remediation =
            calleeName === 'computed'
              ? 'Use `createResource` for async-derived state, or compute synchronously over a signal that holds the awaited value.'
              : 'Read all tracked signals before any await, or use `watch(source, asyncCb)` for async-in-callback patterns.'
          context.report({
            message: `${calleeName}() callback is async — signal reads after the first \`await\` are NOT tracked. ${remediation}`,
            span: getSpan(arg),
          })
        }
      },
    }
    return callbacks
  },
}
