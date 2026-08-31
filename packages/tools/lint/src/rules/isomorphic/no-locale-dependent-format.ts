import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * `toLocaleString()` / `Intl.*` with no explicit locale, in a file that renders
 * on both sides.
 *
 * The server formats with the machine's locale; the browser formats with the
 * user's. `(1234.5).toLocaleString()` is `1,234.5` on a US server and `1.234,5`
 * for a German visitor — so the SSR HTML and the client's first render differ,
 * and hydration mismatches on text that looked completely innocent.
 *
 * It is the archetypal isomorphic bug: correct in every unit test, correct in
 * dev on a machine whose locale matches, wrong in production for some users.
 *
 * Passing a locale explicitly makes the answer deterministic — the whole fix is
 * `toLocaleString('en-US')`, or resolving the locale through `@pyreon/i18n` so
 * both sides read the same value.
 */

const LOCALE_METHODS = new Set([
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toLocaleLowerCase',
  'toLocaleUpperCase',
])
const INTL_CTORS = new Set(['NumberFormat', 'DateTimeFormat', 'RelativeTimeFormat', 'ListFormat', 'Collator'])

export const noLocaleDependentFormat: Rule = {
  meta: {
    id: 'pyreon/no-locale-dependent-format',
    category: 'isomorphic',
    description:
      'Locale-dependent formatting with no explicit locale differs between the server and the browser, so the SSR HTML and the first client render disagree — a hydration mismatch on ordinary-looking text.',
    severity: 'warn',
    appliesTo: ['shared', 'client'],
    fixable: false,
  },
  create(context) {
    const report = (node: unknown, what: string) =>
      context.report({
        message: `\`${what}\` with no explicit locale — the server formats with ITS locale and the browser with the user's, so the two renders differ and hydration mismatches. Pass a locale (\`${what}('en-US')\`) or resolve one through \`@pyreon/i18n\` so both sides agree.`,
        span: getSpan(node),
      })

    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node?.callee
        if (!callee) return

        // `x.toLocaleString()` — no args means "whatever locale you are".
        if (
          callee.type === 'MemberExpression' &&
          callee.property?.type === 'Identifier' &&
          LOCALE_METHODS.has(String(callee.property.name)) &&
          (node.arguments ?? []).length === 0
        ) {
          report(node, String(callee.property.name))
          return
        }

        // `new Intl.NumberFormat()` is handled by the NewExpression visitor
        // below. A branch testing `node.type === 'NewExpression'` HERE was
        // unreachable — the walker never dispatches a NewExpression to this
        // callback — so it was dead code shadowing a live handler, and its
        // uncoverable branches were the file's whole coverage gap.
      },
      NewExpression(node: any) {
        const callee = node?.callee
        if (
          callee?.type === 'MemberExpression' &&
          callee.object?.type === 'Identifier' &&
          String(callee.object.name) === 'Intl' &&
          callee.property?.type === 'Identifier' &&
          INTL_CTORS.has(String(callee.property.name)) &&
          (node.arguments ?? []).length === 0
        ) {
          report(node, `Intl.${String(callee.property.name)}`)
        }
      },
    }
    return callbacks
  },
}
