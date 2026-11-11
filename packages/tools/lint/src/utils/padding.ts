/**
 * Blank-line helpers shared by the `style` padding rules.
 *
 * The contract every padding rule keeps, so the rules can never fight the
 * formatter (oxfmt keeps one blank line between statements, collapses runs of
 * them, and deletes them at the start and end of a block — it never ADDS one):
 *
 * - A rule only ever asks for a blank line BETWEEN two statements, never at the
 *   start or end of a block.
 * - A comment directly above a statement belongs to that statement, so the fix
 *   inserts the blank line ABOVE the comment, never between it and its code.
 * - A comment on the previous statement's last line is that statement's trailing
 *   comment and stays where it is.
 * - The fix is a zero-width insertion of one newline at the start of a line. It
 *   cannot overlap another fix, and once applied the gap has a blank line, so a
 *   second `--fix` changes nothing.
 * - Two statements on one line (`a(); return b`) are left alone: splitting lines
 *   is the formatter's job.
 */

import type { RuleContext, SourceComment, Span } from '../types'

interface Located {
  start: number
  end: number
}

/** What sits between two adjacent statements. */
export interface Gap {
  /** `next` starts on the line where `prev` ends — nothing a blank line can fix. */
  sameLine: boolean
  /** At least one empty line (outside any comment) separates them. */
  hasBlankLine: boolean
  /** A comment on its own line sits between them, directly above `next`. */
  hasLeadingComment: boolean
  /** Line-start offset where inserting a newline creates the blank line. */
  insertAt: number
  /** The file's line ending at that point (`\n` or `\r\n`). */
  newline: string
}

export interface Padding {
  /** 1-based line of an offset. */
  lineOf(offset: number): number
  /** Does the node span more than one line? */
  isMultiline(node: Located): boolean
  /** Describe the gap between two adjacent statements. */
  gap(prev: Located, next: Located): Gap
  /**
   * Report a missing blank line before `next`, with the zero-width fix.
   * No-op when the gap already has one or both sit on one line.
   */
  requireBlankBefore(prev: Located, next: Located, message: string): boolean
}

// One-entry memo: every padding rule in a run asks for the same file's line
// starts. Holding the LAST source only (not a map) keeps it from growing.
let memoSource: string | undefined
let memoStarts: number[] = []

function lineStartsOf(source: string): number[] {
  if (source === memoSource) return memoStarts
  const starts = [0]
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1)
  memoSource = source
  memoStarts = starts
  return starts
}

/** Index of the first comment whose `start` is >= `offset`. */
function firstCommentFrom(comments: readonly SourceComment[], offset: number): number {
  let lo = 0
  let hi = comments.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((comments[mid] as SourceComment).start < offset) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function createPadding(context: RuleContext): Padding {
  const source = context.getSourceText()
  const comments = context.getComments()
  const starts = lineStartsOf(source)

  function lineOf(offset: number): number {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if ((starts[mid] as number) <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  const lineStart = (line: number): number => starts[line - 1] as number

  function lineIsBlank(line: number, between: readonly SourceComment[]): boolean {
    const from = lineStart(line)
    const to = line < starts.length ? lineStart(line + 1) - 1 : source.length
    for (let i = from; i < to; i++) {
      const c = source.charCodeAt(i)
      // space, tab, CR
      if (c !== 32 && c !== 9 && c !== 13) return false
    }
    // An empty line INSIDE a block comment is part of the comment, not a gap.
    for (const c of between) if (c.start < from && c.end > from) return false
    return true
  }

  function gap(prev: Located, next: Located): Gap {
    const prevLine = lineOf(prev.end)
    const nextLine = lineOf(next.start)
    const between: SourceComment[] = []
    for (let i = firstCommentFrom(comments, prev.end); i < comments.length; i++) {
      const c = comments[i] as SourceComment
      if (c.start >= next.start) break
      between.push(c)
    }

    let hasBlankLine = false
    for (let line = prevLine + 1; line < nextLine; line++) {
      if (lineIsBlank(line, between)) {
        hasBlankLine = true
        break
      }
    }

    // The first comment that starts on its own line (after `prev`'s last line)
    // opens `next`'s leading comment block.
    let insertLine = nextLine
    let hasLeadingComment = false
    for (const c of between) {
      const line = lineOf(c.start)
      if (line <= prevLine) continue
      if (line < nextLine) hasLeadingComment = true
      insertLine = Math.min(insertLine, line)
      break
    }

    const insertAt = lineStart(insertLine)
    const newline = insertAt >= 2 && source.charCodeAt(insertAt - 2) === 13 ? '\r\n' : '\n'
    return { sameLine: nextLine <= prevLine, hasBlankLine, hasLeadingComment, insertAt, newline }
  }

  function firstLineSpan(node: Located): Span {
    const eol = source.indexOf('\n', node.start)
    const end = eol === -1 || eol > node.end ? node.end : eol
    return { start: node.start, end: Math.max(end, node.start) }
  }

  return {
    lineOf,
    isMultiline: (node) => lineOf(node.end) > lineOf(node.start),
    gap,
    requireBlankBefore(prev, next, message) {
      const g = gap(prev, next)
      if (g.sameLine || g.hasBlankLine) return false
      context.report({
        message,
        span: firstLineSpan(next),
        fix: { span: { start: g.insertAt, end: g.insertAt }, replacement: g.newline },
      })
      return true
    },
  }
}

/** Strip parentheses (oxc keeps them as `ParenthesizedExpression`) and TS wrappers. */
export function unwrapExpression(node: any): any {
  let n = node
  while (
    n &&
    (n.type === 'ParenthesizedExpression' ||
      n.type === 'TSAsExpression' ||
      n.type === 'TSSatisfiesExpression' ||
      n.type === 'TSNonNullExpression' ||
      n.type === 'TSTypeAssertion')
  ) {
    n = n.expression
  }
  return n
}
