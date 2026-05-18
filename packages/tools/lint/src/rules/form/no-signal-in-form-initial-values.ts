import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * Opt-in, dependency-gated `@pyreon/form` best-practice rule.
 *
 * `useForm({ initialValues })` captures `initialValues` exactly ONCE at
 * form setup. Reading a signal there (`{ x: someSignal() }`) snapshots
 * the value at mount time — the field will NOT track the signal, so
 * later signal writes never reach the form. Pass the plain initial
 * value and update dynamically via `form.setFieldValue(...)` or a
 * reactive field instead.
 *
 * Conservative shape (zero false positives): fires only on
 *   `useForm({ initialValues: { <key>: <Identifier>() } })`
 * where the property value is a CallExpression whose callee is a bare
 * Identifier and which takes zero arguments — the signal-read shape.
 * Member-call values (`obj.method()`), argument-bearing calls (helpers
 * like `makeDefault(x)`), and non-call values are all left alone.
 *
 * Stays completely silent in projects that don't depend on
 * `@pyreon/form`.
 */
export const noSignalInFormInitialValues: Rule = {
  meta: {
    id: 'pyreon/no-signal-in-form-initial-values',
    category: 'form',
    description:
      'In @pyreon/form projects, do not read a signal inside useForm({ initialValues }) — it snapshots at setup and never tracks.',
    severity: 'warn',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    if (!isProjectDependency(context.getFilePath(), '@pyreon/form')) {
      return {}
    }

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node.callee
        if (!callee || callee.type !== 'Identifier' || callee.name !== 'useForm') {
          return
        }

        const args = node.arguments
        if (!args || args.length === 0) return
        const optionsArg = args[0]
        if (!optionsArg || optionsArg.type !== 'ObjectExpression') return

        // Find the `initialValues` property.
        let initialValuesProp: any = null
        for (const prop of optionsArg.properties ?? []) {
          if (
            prop.type === 'Property' &&
            !prop.computed &&
            ((prop.key?.type === 'Identifier' && prop.key.name === 'initialValues') ||
              (prop.key?.type === 'Literal' && prop.key.value === 'initialValues'))
          ) {
            initialValuesProp = prop
            break
          }
        }
        if (!initialValuesProp) return

        const initialValues = initialValuesProp.value
        if (!initialValues || initialValues.type !== 'ObjectExpression') return

        for (const field of initialValues.properties ?? []) {
          if (field.type !== 'Property') continue
          const value = field.value
          if (
            value?.type === 'CallExpression' &&
            value.callee?.type === 'Identifier' &&
            (value.arguments?.length ?? 0) === 0
          ) {
            const keyName =
              field.key?.type === 'Identifier'
                ? field.key.name
                : field.key?.type === 'Literal'
                  ? String(field.key.value)
                  : '<field>'
            context.report({
              message: `\`${keyName}: ${value.callee.name}()\` reads a signal inside useForm({ initialValues }) — initialValues is captured once at setup and won't track. Pass the plain initial value; update dynamically via \`form.setFieldValue\` or a reactive field.`,
              span: getSpan(value),
            })
          }
        }
      },
    }
    return callbacks
  },
}
