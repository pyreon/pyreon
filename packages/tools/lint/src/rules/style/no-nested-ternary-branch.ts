import type { Rule, VisitorCallbacks } from '../../types'
import { unwrapExpression } from '../../utils/padding'

/**
 * `pyreon/no-nested-ternary-branch` — no ternary inside another ternary's test
 * or consequent; flat chains in the alternate position are fine up to
 * `maxOutcomes` (default 4; `readable-strict` uses 3).
 *
 * ```ts
 * // fine — a flat chain reads like a switch
 * const tone = score > 90 ? 'great' : score > 50 ? 'ok' : 'poor'
 * // flagged — the inner branch is read inside-out
 * const label = ready ? (error ? 'failed' : 'done') : 'waiting'
 * ```
 *
 * Deliberately NOT ESLint's `no-nested-ternary`, which flags both shapes. In
 * this repo 562 of 594 nested ternaries are the flat chain, which the
 * formatter lays out one outcome per line; only 32 nest inside a branch.
 * Flagging all of them would teach people to ignore the rule.
 */

const DEFAULT_MAX_OUTCOMES = 4

function asConditional(node: any): any {
  const n = unwrapExpression(node)
  return n?.type === 'ConditionalExpression' ? n : null
}

export const noNestedTernaryBranch: Rule = {
  meta: {
    id: 'pyreon/no-nested-ternary-branch',
    category: 'style',
    description:
      'Disallow a ternary inside another ternary’s test or consequent, and cap the length of flat ternary chains.',
    severity: 'info',
    fixable: false,
    optIn: true,
    skipGenerated: true,
    schema: { maxOutcomes: 'number' },
  },
  create(context) {
    const options = context.getOptions()
    const maxOutcomes =
      typeof options.maxOutcomes === 'number' ? options.maxOutcomes : DEFAULT_MAX_OUTCOMES
    // Conditionals that continue a chain (the alternate of another one). They
    // are counted from the chain's root, never as a root themselves.
    const chainLinks = new WeakSet<object>()

    const callbacks: VisitorCallbacks = {
      ConditionalExpression(node: any) {
        for (const inner of [asConditional(node.test), asConditional(node.consequent)]) {
          if (!inner) continue
          context.report({
            message:
              'This ternary sits inside another ternary’s branch. Use an if/else, a named const, or a flat chain. Nested branches are read inside-out.',
            span: { start: inner.start, end: inner.end },
          })
        }

        const next = asConditional(node.alternate)
        if (next) chainLinks.add(next)
        if (chainLinks.has(node)) return

        let outcomes = 2
        for (let link = next; link; link = asConditional(link.alternate)) outcomes++
        if (outcomes <= maxOutcomes) return
        context.report({
          message: `This ternary chain has ${outcomes} outcomes (max ${maxOutcomes}). Use a lookup object, a switch, or an if/else chain. Long chains hide which branch wins.`,
          span: { start: node.start, end: node.end },
        })
      },
    }
    return callbacks
  },
}
