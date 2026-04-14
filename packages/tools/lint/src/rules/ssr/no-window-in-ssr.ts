import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { BROWSER_GLOBALS } from '../../utils/imports'

export const noWindowInSsr: Rule = {
  meta: {
    id: 'pyreon/no-window-in-ssr',
    category: 'ssr',
    description: 'Disallow browser globals outside onMount/effect/typeof guards — they break SSR.',
    severity: 'error',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    // Configurable `exemptPaths` option — projects opt out directories
    // that legitimately run in a DOM-only environment (e.g. a DOM renderer
    // package has no SSR scenario). Monorepo configures its own paths in
    // `.pyreonlintrc.json`; user apps typically leave this empty.
    if (isPathExempt(context)) return {}

    let safeDepth = 0
    let typeofGuardDepth = 0

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (isCallTo(node, 'onMount') || isCallTo(node, 'effect')) {
          safeDepth++
        }
      },
      'CallExpression:exit'(node: any) {
        if (isCallTo(node, 'onMount') || isCallTo(node, 'effect')) {
          safeDepth--
        }
      },
      IfStatement(node: any) {
        // typeof window !== "undefined"
        const test = node.test
        if (
          test?.type === 'BinaryExpression' &&
          test.left?.type === 'UnaryExpression' &&
          test.left.operator === 'typeof'
        ) {
          typeofGuardDepth++
        }
      },
      'IfStatement:exit'(node: any) {
        const test = node.test
        if (
          test?.type === 'BinaryExpression' &&
          test.left?.type === 'UnaryExpression' &&
          test.left.operator === 'typeof'
        ) {
          typeofGuardDepth--
        }
      },
      Identifier(node: any, parent: any) {
        if (safeDepth > 0 || typeofGuardDepth > 0) return
        if (!BROWSER_GLOBALS.has(node.name)) return

        // Skip typeof expressions: typeof window
        if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof') return

        // Skip import specifiers
        if (
          parent?.type === 'ImportSpecifier' ||
          parent?.type === 'ImportDefaultSpecifier' ||
          parent?.type === 'ImportNamespaceSpecifier'
        )
          return

        // Skip property access on member expressions (only flag when used as the object)
        if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed)
          return

        context.report({
          message: `Browser global \`${node.name}\` used outside \`onMount\`/\`effect\`/typeof guard — this will fail during SSR. Wrap in \`onMount(() => { ... })\`.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
