import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isTestFile } from '../../utils/package-classification'

export const noUnregisteredField: Rule = {
  meta: {
    id: 'pyreon/no-unregistered-field',
    category: 'form',
    description: 'Warn when useField() is called without a corresponding register() call.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    // Heuristic: skip test files. The rule fires when `useField()` is
    // called but no matching `register()` is found — usually a real bug
    // (the field is dead). But form tests routinely call `useField` to
    // assert field state without rendering a real DOM input. A precise
    // check would need to detect "the return is not destructured into
    // props passed to a JSX element" — impractical at lint level.
    if (isTestFile(context.getFilePath())) return {}

    const fieldDecls = new Map<string, { span: { start: number; end: number } }>()
    const registeredNames = new Set<string>()

    const callbacks: VisitorCallbacks = {
      VariableDeclarator(node: any) {
        const init = node.init
        if (!init || !isCallTo(init, 'useField')) return
        const id = node.id
        if (!id || id.type !== 'Identifier') return
        fieldDecls.set(id.name, { span: getSpan(node) })
      },
      CallExpression(node: any) {
        const callee = node.callee
        if (!callee || callee.type !== 'MemberExpression') return
        if (callee.property?.type !== 'Identifier' || callee.property.name !== 'register') return
        if (callee.object?.type === 'Identifier') {
          registeredNames.add(callee.object.name)
        }
      },
      'Program:exit'() {
        for (const [name, { span }] of fieldDecls) {
          if (!registeredNames.has(name)) {
            context.report({
              message: `\`useField()\` result \`${name}\` is never registered — call \`${name}.register()\` to connect it to the form.`,
              span,
            })
          }
        }
      },
    }
    return callbacks
  },
}
