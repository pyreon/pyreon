import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isServerOnlyFile } from '../../utils/server-only'

/**
 * `pyreon/no-process-dev-gate` — flag the broken `typeof process` dev-mode gate
 * pattern that is dead code in real Vite browser bundles.
 *
 * The pattern this rule catches:
 *
 * ```ts
 * const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
 * ```
 *
 * This works in vitest (Node, `process` is defined) but is **silently dead
 * code in real Vite browser bundles** because Vite does not polyfill
 * `process` for the client. Every dev warning gated on this constant never
 * fires for real users in dev mode.
 *
 * The fix is to use `import.meta.env.DEV`, which Vite/Rolldown literal-replace
 * at build time:
 *
 * ```ts
 * // No const needed — read directly at the use site so the bundler can fold:
 * if (!import.meta.env?.DEV) return
 * ```
 *
 * Vitest sets `import.meta.env.DEV === true` automatically (because it is
 * Vite-based), so existing tests continue to pass.
 *
 * Reference implementation: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`.
 *
 * **Auto-fix**: replaces the assignment with `import.meta.env?.DEV === true`.
 * Does NOT delete the const declaration — that has to happen by hand because
 * the variable name and downstream usages may need updating in callers.
 *
 * **Server-package exception**: server-only files run in Node where `process`
 * is always defined, so the pattern is correct there. The rule skips files
 * whose paths match `SERVER_PACKAGE_PATTERNS` in `utils/server-only.ts`.
 */

export const noProcessDevGate: Rule = {
  meta: {
    id: 'pyreon/no-process-dev-gate',
    category: 'architecture',
    description:
      'Forbid `typeof process !== "undefined" && process.env.NODE_ENV !== "production"` as a dev-mode gate. Use `import.meta.env.DEV` instead — `typeof process` is dead code in real Vite browser bundles because Vite does not polyfill `process` for the client.',
    severity: 'error',
    fixable: true,
  },
  create(context) {
    const filePath = context.getFilePath()

    // Skip test files — vitest has `process`, the gate works there, and
    // tests are not shipped to users.
    if (
      filePath.includes('/tests/') ||
      filePath.includes('/test/') ||
      filePath.includes('/__tests__/') ||
      filePath.includes('.test.') ||
      filePath.includes('.spec.')
    ) {
      return {}
    }

    // Skip server-only packages — they run in Node where `process` is
    // always defined, so the pattern is correct there.
    if (isServerOnlyFile(filePath)) {
      return {}
    }

    /**
     * Match the broken pattern at the AST level. We're looking for any
     * `LogicalExpression` whose two sides are:
     *
     *   1. `typeof process !== 'undefined'` (a UnaryExpression on the LHS
     *      of a BinaryExpression with operator `!==`)
     *   2. `process.env.NODE_ENV !== 'production'` (a MemberExpression on
     *      the LHS of a BinaryExpression with operator `!==`)
     *
     * The order can be either way (process check first or NODE_ENV check
     * first), and the operator can be `&&` or `||` (we only flag `&&`
     * because `||` doesn't make sense as a dev gate).
     */
    function isTypeofProcessCheck(node: any): boolean {
      // typeof process !== 'undefined'
      if (node?.type !== 'BinaryExpression') return false
      if (node.operator !== '!==' && node.operator !== '!=') return false
      const left = node.left
      const right = node.right
      if (left?.type !== 'UnaryExpression' || left.operator !== 'typeof') return false
      if (left.argument?.type !== 'Identifier' || left.argument.name !== 'process') return false
      if (
        (right?.type === 'Literal' || right?.type === 'StringLiteral') &&
        right.value === 'undefined'
      ) {
        return true
      }
      return false
    }

    function isNodeEnvCheck(node: any): boolean {
      // process.env.NODE_ENV !== 'production'
      if (node?.type !== 'BinaryExpression') return false
      if (node.operator !== '!==' && node.operator !== '!=') return false
      const left = node.left
      const right = node.right
      if (left?.type !== 'MemberExpression') return false
      if (left.object?.type !== 'MemberExpression') return false
      if (left.object.object?.type !== 'Identifier' || left.object.object.name !== 'process') {
        return false
      }
      if (left.object.property?.type !== 'Identifier' || left.object.property.name !== 'env') {
        return false
      }
      if (left.property?.type !== 'Identifier' || left.property.name !== 'NODE_ENV') return false
      if (
        (right?.type === 'Literal' || right?.type === 'StringLiteral') &&
        right.value === 'production'
      ) {
        return true
      }
      return false
    }

    function isBrokenDevGate(node: any): boolean {
      if (node?.type !== 'LogicalExpression') return false
      if (node.operator !== '&&') return false
      // Order can be (typeof process) && (NODE_ENV) OR vice versa
      return (
        (isTypeofProcessCheck(node.left) && isNodeEnvCheck(node.right)) ||
        (isNodeEnvCheck(node.left) && isTypeofProcessCheck(node.right))
      )
    }

    const callbacks: VisitorCallbacks = {
      LogicalExpression(node: any) {
        if (!isBrokenDevGate(node)) return

        const span = getSpan(node)
        // Auto-fix: replace the entire `typeof process ... && process.env.NODE_ENV ...`
        // expression with `import.meta.env?.DEV === true`. We use optional
        // chaining + strict equality so the expression is `false` (not
        // `undefined`) when `import.meta.env` is missing — preserving the
        // boolean shape callers expect.
        const replacement = 'import.meta.env?.DEV === true'

        context.report({
          message:
            '`typeof process !== "undefined" && process.env.NODE_ENV !== "production"` is dead code in real Vite browser bundles — Vite does not polyfill `process`, so this guard is `false` and any wrapped dev warnings never fire for real users. Use `import.meta.env.DEV` instead, which Vite literal-replaces at build time and tree-shakes correctly in prod. Reference implementation: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`.',
          span,
          fix: { span, replacement },
        })
      },
    }

    return callbacks
  },
}
