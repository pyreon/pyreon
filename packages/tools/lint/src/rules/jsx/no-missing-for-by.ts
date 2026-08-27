import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'

/**
 * `<For each>` without a `by` prop defeats keyed reconciliation — every
 * update remounts the whole list instead of moving surviving rows.
 *
 * Severity is `error` because this is a real defect, not a preference:
 * see `.claude/rules/anti-patterns.md` → "Missing `by` on `<For>`".
 *
 * NOTE: this rule absorbed `pyreon/no-large-for-without-by`, which shipped
 * a byte-identical implementation under a second id in the `performance`
 * category. Both fired, so a single `<For>` produced two diagnostics with
 * the same message at the same span — one `warn`, one `error`. The
 * duplicate is gone; this rule keeps the stronger severity so the gate is
 * not silently weakened. `src/tests/rule-registry.test.ts` locks the class.
 */
export const noMissingForBy: Rule = {
  meta: {
    id: 'pyreon/no-missing-for-by',
    category: 'jsx',
    description:
      'Require a `by` prop on `<For>` — without it, keyed reconciliation is defeated and every update remounts the whole list.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier' || name.name !== 'For') return
        if (hasJSXAttribute(node, 'by')) return
        context.report({
          message:
            '`<For>` without `by` prop — provide a key function for efficient reconciliation.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
