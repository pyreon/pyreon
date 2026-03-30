import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo, isSetCall } from '../../utils/ast'

interface ScopeInfo {
  setCalls: Array<{ span: { start: number; end: number } }>
  hasBatch: boolean
  insideBatch: boolean
  node: any
}

export const noUnbatchedUpdates: Rule = {
  meta: {
    id: 'pyreon/no-unbatched-updates',
    category: 'reactivity',
    description: 'Warn when 3+ .set() calls occur in the same function without batch().',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const scopeStack: ScopeInfo[] = []
    let batchDepth = 0

    function enterScope(node: any) {
      scopeStack.push({ setCalls: [], hasBatch: false, insideBatch: batchDepth > 0, node })
    }

    function exitScope() {
      const scope = scopeStack.pop()
      if (!scope) return
      if (!scope.hasBatch && !scope.insideBatch && scope.setCalls.length >= 3) {
        context.report({
          message: `${scope.setCalls.length} signal \`.set()\` calls without \`batch()\` — wrap in \`batch(() => { ... })\` to avoid unnecessary re-renders.`,
          span: getSpan(scope.node),
        })
      }
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration(node: any) {
        enterScope(node)
      },
      'FunctionDeclaration:exit'() {
        exitScope()
      },
      FunctionExpression(node: any) {
        enterScope(node)
      },
      'FunctionExpression:exit'() {
        exitScope()
      },
      ArrowFunctionExpression(node: any) {
        enterScope(node)
      },
      'ArrowFunctionExpression:exit'() {
        exitScope()
      },
      CallExpression(node: any) {
        const currentScope = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : undefined
        if (isCallTo(node, 'batch')) {
          batchDepth++
          if (currentScope) {
            currentScope.hasBatch = true
          }
        }
        if (currentScope && isSetCall(node)) {
          currentScope.setCalls.push({ span: getSpan(node) })
        }
      },
      'CallExpression:exit'(node: any) {
        if (isCallTo(node, 'batch')) {
          batchDepth--
        }
      },
    }
    return callbacks
  },
}
