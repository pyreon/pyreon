import type { Rule, VisitorCallbacks } from '../../types'
import { createPadding } from '../../utils/padding'

/**
 * `pyreon/padding-before-return` — a blank line before a `return` that ends a
 * block of real work: when the statement before it spans more than one line,
 * or when `minStatements` (default 3) or more statements precede it.
 *
 * ESLint's classic "always a blank line before return" would touch 11,516
 * sites in this repo, two-line functions included, where the blank line is
 * only noise. The threshold keeps the rule to blocks where the result is
 * genuinely its own paragraph. A short guard (`if (!x) return null`) is a
 * one-statement block and never flagged, nor is a `return` that a comment
 * already sets apart.
 */

const DEFAULT_MIN_STATEMENTS = 3

export const paddingBeforeReturn: Rule = {
  meta: {
    id: 'pyreon/padding-before-return',
    category: 'style',
    description:
      'Require a blank line before a `return` that follows a multi-line statement or several statements.',
    severity: 'info',
    fixable: true,
    optIn: true,
    skipGenerated: true,
    scanTarget: ['source', 'test'],
    schema: { minStatements: 'number', afterMultiline: 'boolean' },
  },
  create(context) {
    const padding = createPadding(context)
    const options = context.getOptions()
    const minStatements =
      typeof options.minStatements === 'number' ? options.minStatements : DEFAULT_MIN_STATEMENTS
    const afterMultiline = options.afterMultiline !== false

    function check(body: readonly any[] | undefined): void {
      if (!body) return
      for (let i = 1; i < body.length; i++) {
        const next = body[i]
        if (next.type !== 'ReturnStatement') continue
        const prev = body[i - 1]
        const longBlock = i >= minStatements
        const afterLong = afterMultiline && padding.isMultiline(prev)
        if (!longBlock && !afterLong) continue
        const gap = padding.gap(prev, next)
        if (gap.hasLeadingComment) continue
        padding.requireBlankBefore(
          prev,
          next,
          'Add a blank line before `return`. The result should stand apart from the work that produced it.',
        )
      }
    }

    const callbacks: VisitorCallbacks = {
      BlockStatement(node: any) {
        check(node.body)
      },
      StaticBlock(node: any) {
        check(node.body)
      },
      SwitchCase(node: any) {
        check(node.consequent)
      },
    }
    return callbacks
  },
}
