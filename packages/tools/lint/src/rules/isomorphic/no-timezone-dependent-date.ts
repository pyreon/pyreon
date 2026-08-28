import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Local-timezone date reads in a file that renders on both sides.
 *
 * A server is almost always UTC; the visitor is not. `new Date().getHours()`
 * is 14 on the server and 15 in Berlin, so the rendered text differs between
 * the SSR pass and hydration — and "today" can be a different day entirely
 * either side of midnight.
 *
 * The UTC variants (`getUTCHours`) and an explicit `timeZone` option are both
 * deterministic and are not flagged. `Date.now()` is covered by
 * `no-mismatch-risk`, which owns non-determinism rather than timezone skew.
 */

const LOCAL_DATE_READS = new Set([
  'getHours',
  'getMinutes',
  'getDate',
  'getDay',
  'getMonth',
  'getFullYear',
  'getTimezoneOffset',
  'toDateString',
  'toTimeString',
  'toString',
])

export const noTimezoneDependentDate: Rule = {
  meta: {
    id: 'pyreon/no-timezone-dependent-date',
    category: 'isomorphic',
    description:
      'Local-timezone date reads render differently on a UTC server and in the visitor’s browser — the same expression produces different text on each side, so hydration mismatches.',
    severity: 'warn',
    appliesTo: ['shared', 'client'],
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node?.callee
        if (callee?.type !== 'MemberExpression') return
        if (callee.property?.type !== 'Identifier') return
        const name = String(callee.property.name)
        if (!LOCAL_DATE_READS.has(name)) return

        // Only when the receiver is demonstrably a Date — `new Date()`, or an
        // identifier that looks like one. A bare `x.toString()` is not a date
        // read, and flagging it would be the false positive that gets the rule
        // switched off.
        // A Date built from EXPLICIT components is not skewed: both sides
        // construct in their own local frame and read the same numbers back —
        // `new Date(y, m + 1, 0).getDate()` is days-in-month arithmetic and
        // gives the same answer everywhere. Only a Date that represents an
        // INSTANT — `new Date()`, or one parsed from a timestamp or string —
        // lands on a different wall-clock reading per timezone.
        //
        // Without this, the rule flagged `CalendarBase`'s pure date maths.
        const obj = callee.object
        const isInstant =
          (obj?.type === 'NewExpression' &&
            obj.callee?.type === 'Identifier' &&
            String(obj.callee.name) === 'Date' &&
            (obj.arguments ?? []).length <= 1) ||
          (obj?.type === 'Identifier' && /date|time|stamp/i.test(String(obj.name)))
        if (!isInstant) return

        context.report({
          message: `\`${name}()\` reads the LOCAL timezone — a server is UTC and the visitor is not, so this renders different text on each side and hydration mismatches. Use the \`getUTC*\` variant, or format with an explicit \`timeZone\`.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
