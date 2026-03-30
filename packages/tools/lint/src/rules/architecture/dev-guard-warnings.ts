import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

export const devGuardWarnings: Rule = {
  meta: {
    id: 'pyreon/dev-guard-warnings',
    category: 'architecture',
    description: 'Require console.warn/error calls to be wrapped in `if (__DEV__)` guards.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath()
    // Skip test and example files
    if (
      filePath.includes('/tests/') ||
      filePath.includes('/test/') ||
      filePath.includes('/examples/') ||
      filePath.includes('.test.') ||
      filePath.includes('.spec.')
    ) {
      return {}
    }

    let devGuardDepth = 0
    const callbacks: VisitorCallbacks = {
      IfStatement(node: any) {
        if (node.test?.type === 'Identifier' && node.test.name === '__DEV__') {
          devGuardDepth++
        }
      },
      'IfStatement:exit'(node: any) {
        if (node.test?.type === 'Identifier' && node.test.name === '__DEV__') {
          devGuardDepth--
        }
      },
      CallExpression(node: any) {
        if (devGuardDepth > 0) return

        const callee = node.callee
        if (
          callee?.type === 'MemberExpression' &&
          callee.object?.type === 'Identifier' &&
          callee.object.name === 'console' &&
          callee.property?.type === 'Identifier' &&
          (callee.property.name === 'warn' || callee.property.name === 'error')
        ) {
          context.report({
            message: `\`console.${callee.property.name}()\` without \`__DEV__\` guard — dev warnings must be tree-shakeable in production. Wrap in \`if (__DEV__) { ... }\`.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
