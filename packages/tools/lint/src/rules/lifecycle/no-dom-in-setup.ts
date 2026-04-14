import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'

const DOM_METHODS = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
])

export const noDomInSetup: Rule = {
  meta: {
    id: 'pyreon/no-dom-in-setup',
    category: 'lifecycle',
    description: 'Warn when DOM query methods are used outside onMount or effect.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    let safeDepth = 0
    function isSafeContextCall(node: any): boolean {
      // Lifecycle + effect hooks only run post-mount in a browser.
      // `onUnmount` / `onCleanup` fire after the component has mounted so
      // the DOM exists. `renderEffect` is the signal-system equivalent of
      // `effect`. `requestAnimationFrame` only schedules its callback
      // inside a browser frame, so its body is always post-setup execution.
      return (
        isCallTo(node, 'onMount') ||
        isCallTo(node, 'onUnmount') ||
        isCallTo(node, 'onCleanup') ||
        isCallTo(node, 'effect') ||
        isCallTo(node, 'renderEffect') ||
        isCallTo(node, 'requestAnimationFrame')
      )
    }
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (isSafeContextCall(node)) safeDepth++

        if (safeDepth > 0) return

        // Check for document.querySelector() etc.
        const callee = node.callee
        if (
          callee?.type === 'MemberExpression' &&
          callee.object?.type === 'Identifier' &&
          callee.object.name === 'document' &&
          callee.property?.type === 'Identifier' &&
          DOM_METHODS.has(callee.property.name)
        ) {
          context.report({
            message: `\`document.${callee.property.name}()\` outside \`onMount\`/\`effect\` — DOM is not available during SSR or setup phase.`,
            span: getSpan(node),
          })
        }
      },
      'CallExpression:exit'(node: any) {
        if (isSafeContextCall(node)) safeDepth--
      },
    }
    return callbacks
  },
}
