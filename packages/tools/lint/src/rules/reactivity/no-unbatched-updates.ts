import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo, isSetCall } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

interface ScopeInfo {
  hasBatch: boolean
  insideBatch: boolean
  node: any
}

/**
 * Count the MAXIMUM `.set()` calls that can fire on ANY SINGLE execution
 * path through `node`. Branching constructs (if / else / switch / try-catch
 * / ternary / logical-and-or) take MAX across mutually-exclusive arms.
 * Sequential statements sum. Nested functions are NOT counted — they
 * become their own execution paths handled by their own scope.
 *
 * This is the precision delta over the previous "sum every `.set()` in
 * the function" heuristic: a function with `if (x) a.set(1); else b.set(2)`
 * has max-path = 1 (only one arm fires), not 2.
 *
 * False positives surfaced by the old shape that motivated the rewrite:
 * - `@pyreon/form` `runValidation` — 3 `errorSig.set()` calls in 3
 *   mutually exclusive branches (validator success / threw / no validator).
 *   Old rule: 3 → flagged. New rule: max-path = 1 → silent.
 * - `@pyreon/reactivity` `createStore` proxy `set` trap — multiple
 *   `.set()` calls but per-trap-call only one fires (mutex by signal
 *   identity / Object.is dedup). Old rule: 4 → flagged. New rule: still
 *   counts because they're sequential at the syntax level — flagged at
 *   that layer with an inline-suppression rationale (the actual runtime
 *   invariant is application-specific).
 */
function maxPathSets(node: any): number {
  if (!node || typeof node !== 'object') return 0
  switch (node.type) {
    case 'BlockStatement':
      return (node.body as any[]).reduce((sum: number, stmt: any) => sum + maxPathSets(stmt), 0)
    case 'ExpressionStatement':
      return maxPathSets(node.expression)
    case 'CallExpression':
      return isSetCall(node) ? 1 : 0
    case 'IfStatement':
      return Math.max(maxPathSets(node.consequent), maxPathSets(node.alternate))
    case 'SwitchStatement':
      // Each SwitchCase.consequent is Statement[]. Cases are mutually
      // exclusive (assume no fall-through — conservative for both
      // false-positive AND false-negative directions).
      return Math.max(
        0,
        ...(node.cases as any[]).map((c: any) =>
          (c.consequent as any[]).reduce((s: number, st: any) => s + maxPathSets(st), 0),
        ),
      )
    case 'TryStatement': {
      // try OR catch (mutually exclusive on the throw path) + finally (always runs).
      const tryMax = maxPathSets(node.block)
      const catchMax = node.handler ? maxPathSets(node.handler.body) : 0
      const finallyMax = maxPathSets(node.finalizer)
      return Math.max(tryMax, catchMax) + finallyMax
    }
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      // ONE iteration's body — that's the per-event cost of batching.
      // A loop body with 4 sets benefits from batch() exactly as a
      // straight-line 4-set sequence does.
      return maxPathSets(node.body)
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'FunctionDeclaration':
      // Nested function — separate execution path, handled by its own
      // scope entry. Don't double-count.
      return 0
    case 'VariableDeclaration':
      return (node.declarations as any[]).reduce(
        (sum: number, d: any) => sum + maxPathSets(d.init),
        0,
      )
    case 'ReturnStatement':
      return maxPathSets(node.argument)
    case 'ThrowStatement':
      return maxPathSets(node.argument)
    case 'AwaitExpression':
    case 'YieldExpression':
    case 'UnaryExpression':
      return maxPathSets(node.argument)
    case 'LogicalExpression':
      // `a && b.set()` — short-circuit: only one side fires.
      return Math.max(maxPathSets(node.left), maxPathSets(node.right))
    case 'ConditionalExpression':
      // ternary — mutually exclusive consequent / alternate
      return maxPathSets(node.test) + Math.max(maxPathSets(node.consequent), maxPathSets(node.alternate))
    case 'SequenceExpression':
      return (node.expressions as any[]).reduce(
        (sum: number, e: any) => sum + maxPathSets(e),
        0,
      )
    case 'AssignmentExpression':
      return maxPathSets(node.right)
    case 'LabeledStatement':
      return maxPathSets(node.body)
    default:
      return 0
  }
}

export const noUnbatchedUpdates: Rule = {
  meta: {
    id: 'pyreon/no-unbatched-updates',
    category: 'reactivity',
    description:
      'Warn when 3+ .set() calls can fire on the SAME execution path in a function without batch().',
    severity: 'warn',
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}
    const scopeStack: ScopeInfo[] = []
    let batchDepth = 0

    function enterScope(node: any) {
      scopeStack.push({ hasBatch: false, insideBatch: batchDepth > 0, node })
    }

    function exitScope() {
      const scope = scopeStack.pop()
      if (!scope) return
      if (scope.hasBatch || scope.insideBatch) return
      const body = scope.node.body
      const count = maxPathSets(body)
      if (count >= 3) {
        context.report({
          message: `${count} signal \`.set()\` calls can fire on a single execution path without \`batch()\` — wrap in \`batch(() => { ... })\` to collapse N notify cycles into one.`,
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
