import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A scroll/touch/wheel listener registered without `{ passive: true }`.
 *
 * The browser cannot know whether a listener will call `preventDefault()`
 * until it has run it — so for these events it waits for JS before scrolling.
 * One non-passive listener on a scroll container makes every frame of every
 * scroll wait on the main thread, which is felt immediately on a phone.
 *
 * Declaring `passive: true` is a promise not to `preventDefault()`, which lets
 * the browser scroll without asking. Only flagged when the options argument is
 * absent or is a literal object that does not mention `passive` — a computed
 * options object cannot be read and is left alone.
 */

const PASSIVE_EVENTS = new Set(['scroll', 'wheel', 'touchstart', 'touchmove', 'mousewheel'])

export const preferPassiveListener: Rule = {
  meta: {
    id: 'pyreon/prefer-passive-listener',
    category: 'web-perf',
    description:
      'A scroll / wheel / touch listener without `{ passive: true }` forces the browser to wait for JS before scrolling — every frame of every scroll blocks on the main thread.',
    severity: 'warn',
    appliesTo: ['client', 'shared'],
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      CallExpression(node: any) {
        const callee = node?.callee
        if (callee?.type !== 'MemberExpression') return
        if (callee.property?.type !== 'Identifier') return
        if (String(callee.property.name) !== 'addEventListener') return

        const args = node.arguments ?? []
        const first = args[0]
        if (first?.type !== 'Literal' || typeof first.value !== 'string') return
        const evt = first.value
        if (!PASSIVE_EVENTS.has(evt)) return

        const opts = args[2]
        // No options at all → not passive.
        if (opts === undefined) {
          report(evt, node)
          return
        }
        // A literal object we can read: does it say `passive`?
        if (opts.type === 'ObjectExpression') {
          const mentionsPassive = (opts.properties ?? []).some(
            (p: any) =>
              p.type === 'Property' &&
              ((p.key?.type === 'Identifier' && String(p.key.name) === 'passive') ||
                (p.key?.type === 'Literal' && String(p.key.value) === 'passive')),
          )
          if (!mentionsPassive) report(evt, node)
        }
        // Anything else (a variable, a spread) is unreadable — stay quiet.
      },
    }

    function report(evt: string, node: unknown): void {
      context.report({
        message: `\`${evt}\` listener without \`{ passive: true }\` — the browser must run this listener before it can scroll, because it cannot know whether you will call \`preventDefault()\`. That blocks a frame on every scroll event. Add \`{ passive: true }\` (a promise not to preventDefault), or use \`useEventListener\` from \`@pyreon/hooks\`, which also handles teardown.`,
        span: getSpan(node),
      })
    }
    return callbacks
  },
}
