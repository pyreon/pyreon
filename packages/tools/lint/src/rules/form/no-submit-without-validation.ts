import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isTestFile } from '../../utils/file-roles'

export const noSubmitWithoutValidation: Rule = {
  meta: {
    id: 'pyreon/no-submit-without-validation',
    category: 'form',
    description: 'Warn when useForm() has onSubmit but no validators or schema.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    // Heuristic: skip test files. The rule fires on any `useForm({ onSubmit })`
    // missing validators, but tests deliberately exercise the un-validated
    // path. A truly precise check would need to detect "this `useForm` is
    // a test stub vs a real production form" — impractical at lint level.
    // Keep the heuristic; consumers who want to test forms with validation
    // explicitly opted-out should use `// pyreon-lint-disable-next-line`.
    if (isTestFile(context.getFilePath())) return {}

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        if (!isCallTo(node, 'useForm')) return
        const args = node.arguments
        if (!args || args.length === 0) return

        const options = args[0]
        if (!options || options.type !== 'ObjectExpression') return

        let hasOnSubmit = false
        let hasValidation = false

        for (const prop of options.properties ?? []) {
          if (prop.type !== 'Property') continue
          const key = prop.key
          if (!key) continue
          const name = key.type === 'Identifier' ? key.name : null
          if (name === 'onSubmit') hasOnSubmit = true
          if (name === 'validators' || name === 'schema') hasValidation = true
        }

        if (hasOnSubmit && !hasValidation) {
          context.report({
            message:
              '`useForm()` has `onSubmit` without `validators` or `schema` — consider adding validation for data integrity.',
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
