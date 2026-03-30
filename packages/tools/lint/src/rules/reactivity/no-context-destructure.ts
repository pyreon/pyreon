import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Detects destructuring the return value of useContext().
 *
 * `const { mode } = useContext(ctx)` loses reactivity when the context
 * provides getter properties. The value is captured once at setup time.
 *
 * Correct: `const ctx = useContext(Ctx)` then read `ctx.mode` lazily.
 */
export const noContextDestructure: Rule = {
  meta: {
    id: 'pyreon/no-context-destructure',
    category: 'reactivity',
    description:
      'Disallow destructuring useContext() — it breaks reactivity when context provides getters.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      VariableDeclarator(node: any) {
        // Match: const { x } = useContext(...)
        const id = node.id
        const init = node.init
        if (!id || !init) return
        if (id.type !== 'ObjectPattern') return
        if (
          init.type !== 'CallExpression' ||
          init.callee?.type !== 'Identifier' ||
          init.callee.name !== 'useContext'
        )
          return

        context.report({
          message:
            'Destructuring useContext() captures values once — reactive getters lose reactivity. Keep the object reference: `const ctx = useContext(Ctx)` and access `ctx.mode` lazily.',
          span: getSpan(id),
        })
      },
    }
    return callbacks
  },
}
