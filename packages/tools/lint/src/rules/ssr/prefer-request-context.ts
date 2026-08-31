import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isApiRouteFile, isServerFile } from '../../utils/file-roles'

export const preferRequestContext: Rule = {
  meta: {
    id: 'pyreon/prefer-request-context',
    category: 'ssr',
    description:
      'Warn about module-level signal()/createStore() in server files — use request context instead.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    // `isServerFile` is a PATH guess — `server` in the path, or `*.server.ts`
    // — and it does not know about fs-router api routes. A module-level
    // `signal()` in `src/routes/api/posts.ts` is exactly this defect and went
    // unreported, which is what the role-aware plan meant when it called this
    // "its broken path guess". Widened here rather than in the shared helper,
    // to keep the change to the rule that needed it.
    const filePath = context.getFilePath()
    if (!isServerFile(filePath) && !isApiRouteFile(filePath)) return {}

    let functionDepth = 0
    const callbacks: VisitorCallbacks = {
      FunctionDeclaration() {
        functionDepth++
      },
      'FunctionDeclaration:exit'() {
        functionDepth--
      },
      FunctionExpression() {
        functionDepth++
      },
      'FunctionExpression:exit'() {
        functionDepth--
      },
      ArrowFunctionExpression() {
        functionDepth++
      },
      'ArrowFunctionExpression:exit'() {
        functionDepth--
      },
      CallExpression(node: any) {
        if (functionDepth > 0) return // only flag module-level calls
        if (isCallTo(node, 'signal') || isCallTo(node, 'createStore')) {
          const name = node.callee.name
          context.report({
            message: `Module-level \`${name}()\` in a server file — this state is shared across all requests. Use \`runWithRequestContext()\` for per-request isolation.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
