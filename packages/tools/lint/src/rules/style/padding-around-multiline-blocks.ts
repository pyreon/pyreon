import type { Rule, VisitorCallbacks } from '../../types'
import { createPadding } from '../../utils/padding'

/**
 * `pyreon/padding-around-multiline-blocks` — a blank line before and after a
 * multi-line `if` / `for` / `while` / `do` / `try` / `switch` inside a function,
 * so each block reads as its own paragraph.
 *
 * Not required when the block is the first or last statement in its body (the
 * formatter removes blank lines there), nor before a block that a comment
 * already introduces. Top-level statements are `padding-between-declarations`'
 * job.
 *
 * `readable-strict` only. This repo's house style is dense inside functions
 * (81% of such blocks have no blank line before them), so in `readable` it
 * would be about 23,000 insertions; on new code, where it costs nothing, the
 * scaffolds turn it on.
 */

const BLOCK_STATEMENTS = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'TryStatement',
  'SwitchStatement',
])

function isBlockStatement(node: any): boolean {
  if (node.type === 'LabeledStatement') return isBlockStatement(node.body)
  return BLOCK_STATEMENTS.has(node.type)
}

export const paddingAroundMultilineBlocks: Rule = {
  meta: {
    id: 'pyreon/padding-around-multiline-blocks',
    category: 'style',
    description:
      'Require a blank line before and after a multi-line `if` / `for` / `while` / `try` / `switch` inside a function.',
    severity: 'info',
    fixable: true,
    optIn: true,
    skipGenerated: true,
  },
  create(context) {
    const padding = createPadding(context)

    function check(body: readonly any[] | undefined): void {
      if (!body) return
      for (let i = 1; i < body.length; i++) {
        const prev = body[i - 1]
        const next = body[i]
        if (isBlockStatement(next) && padding.isMultiline(next)) {
          const gap = padding.gap(prev, next)
          if (!gap.hasLeadingComment) {
            padding.requireBlankBefore(
              prev,
              next,
              'Add a blank line before this block. A multi-line block is its own paragraph.',
            )
            continue
          }
        }
        if (isBlockStatement(prev) && padding.isMultiline(prev)) {
          padding.requireBlankBefore(
            prev,
            next,
            'Add a blank line after the block above. A multi-line block is its own paragraph.',
          )
        }
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
