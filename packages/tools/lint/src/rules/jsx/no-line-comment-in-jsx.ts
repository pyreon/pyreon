import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Tags whose whole point is displaying source text, where a leading `//` is
 * the content rather than a mistake.
 */
const CODE_TAGS = new Set(['code', 'pre', 'kbd', 'samp'])

const isCodeParent = (node: any): boolean => {
  const n = node?.openingElement?.name
  const name = typeof n?.name === 'string' ? n.name : undefined
  if (name === undefined) return false
  return CODE_TAGS.has(name) || /code|snippet|highlight/i.test(name)
}

const startsALine = (text: string): boolean =>
  text.split('\n').some((line) => line.trim().startsWith('//'))

/**
 * JSX has no line comments. `// …` in CHILD position is JSXText, so it renders
 * — on web, and through PMTC on iOS and Android, which faithfully emit it as a
 * `Text` node. The result is a paragraph of developer prose sitting in the
 * running UI, on every target, with nothing said by any compiler.
 *
 * Found once for real: six explanatory lines above a `<Scroll>` in the
 * native-tasks example shipped a comment about `kAXScrollToVisibleAction` to
 * the top of the screen. A line-oriented grep over the repo produced 1,212
 * candidates and essentially all of them were genuine comments inside `{}`
 * expression containers — this needs the AST to see at all, which is exactly
 * why it is worth a rule rather than a habit.
 *
 * Gated to text that sits ALONGSIDE element children, which is the mistake's
 * shape: a comment written between or above JSX siblings. A code sample
 * (`<code>// like this</code>`) is text on its own and is left alone, as is
 * anything under a code-ish tag.
 */
export const noLineCommentInJsx: Rule = {
  meta: {
    id: 'pyreon/no-line-comment-in-jsx',
    category: 'jsx',
    description:
      'A `//` line in JSX child position is not a comment — JSX has no line comments, so it renders as literal text on web AND, through PMTC, on iOS and Android. Use `{/* … */}`.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const check = (node: any): void => {
      const children: any[] = Array.isArray(node?.children) ? node.children : []
      if (children.length === 0) return
      // Only when real elements sit alongside it — the shape of the mistake.
      const hasElementSibling = children.some(
        (c) => c?.type === 'JSXElement' || c?.type === 'JSXFragment',
      )
      if (!hasElementSibling) return
      if (isCodeParent(node)) return
      for (const c of children) {
        if (c?.type !== 'JSXText' || typeof c.value !== 'string') continue
        if (!startsALine(c.value)) continue
        context.report({
          message:
            'This `//` line is not a comment — JSX has no line comments, so it RENDERS as literal text (on web, and as a native `Text` node on iOS/Android through PMTC). Wrap it as `{/* … */}`.',
          span: getSpan(c),
        })
      }
    }
    const callbacks: VisitorCallbacks = {
      JSXElement: check,
      JSXFragment: check,
    }
    return callbacks
  },
}
