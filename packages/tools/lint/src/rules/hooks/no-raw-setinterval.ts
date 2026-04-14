import type { Rule, VisitorCallbacks } from '../../types'
import { isCleanupWrapperFoundation } from '../../utils/package-classification'
import { createComponentContextTracker } from '../../utils/component-context'
import { getSpan, isCallTo } from '../../utils/ast'

const TIMER_FNS = new Set(['setInterval', 'setTimeout'])

export const noRawSetInterval: Rule = {
  meta: {
    id: 'pyreon/no-raw-setinterval',
    category: 'hooks',
    description: 'Suggest wrapping setInterval/setTimeout in onMount for automatic cleanup.',
    severity: 'info',
    fixable: false,
  },
  create(context) {
    // `runtime-dom` + `@pyreon/hooks` implement `useInterval` / `useTimeout`
    // + the raw delegation layer — the rule steers consumers toward those
    // wrappers but the wrappers themselves must call raw `setInterval` /
    // `setTimeout`.
    if (isCleanupWrapperFoundation(context.getFilePath())) return {}

    // Only flag when *inside* a component / hook setup body. Module-level
    // timers, utility functions, and test callbacks have their own
    // lifecycle and don't need component-tied cleanup.
    const ctx = createComponentContextTracker()

    let mountDepth = 0
    const callbacks: VisitorCallbacks = {
      ...ctx.callbacks,
      CallExpression(node: any) {
        if (isCallTo(node, 'onMount')) {
          mountDepth++
        }

        if (mountDepth > 0) return
        if (!ctx.isInComponentOrHook()) return

        const callee = node.callee
        if (!callee || callee.type !== 'Identifier') return
        if (TIMER_FNS.has(callee.name)) {
          context.report({
            message: `\`${callee.name}()\` outside \`onMount\` — wrap in \`onMount(() => { ... return () => clear... })\` for automatic cleanup.`,
            span: getSpan(node),
          })
        }
      },
      'CallExpression:exit'(node: any) {
        if (isCallTo(node, 'onMount')) {
          mountDepth--
        }
      },
    }
    return callbacks
  },
}
