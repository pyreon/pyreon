import type { Nodes, Root } from 'mdast'
import { trimEndChars } from '../_shared/trim-chars'

// ─── Word count — computed at compile time ─────────────────────────────────
//
// Every compiled content module exports `wordCount`, so a reading-time
// label ("6 min read") is a division at render time instead of a walk over
// the page in the browser.
//
// Counted: prose text, inline code and code blocks (a reader reads those
// too). Not counted: frontmatter, raw HTML, MDX expressions and ESM, image
// alt text and URLs.

// A word is a run of letters or digits (an apostrophe inside it allowed),
// so punctuation and operators (`.`, `=`, `=>`) are not words.
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu

function countIn(value: string): number {
  return value.match(WORD)?.length ?? 0
}

function walk(node: Nodes): number {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
      return countIn(node.value)
    case 'yaml':
    case 'html':
    case 'image':
    case 'imageReference':
      return 0
    default:
      break
  }
  if (!('children' in node)) return 0
  let total = 0
  for (const child of node.children) total += walk(child as Nodes)
  return total
}

/**
 * Words in a markdown tree: runs of letters or digits in its text, inline
 * code and code blocks.
 *
 * @internal exported for the pipeline + tests
 */
export function countWords(tree: Root): number {
  return walk(tree)
}

function plainText(node: Nodes): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
      return node.value
    case 'image':
    case 'imageReference':
    case 'html':
    case 'footnoteReference':
      return ''
    default:
      break
  }
  if (!('children' in node)) return ''
  return node.children.map((c) => plainText(c as Nodes)).join('')
}

/** Punctuation and whitespace dropped from the end of a cut excerpt before the `…`. */
function isExcerptTail(ch: string): boolean {
  return /\s/.test(ch) || ',;:.–—-'.includes(ch)
}

/**
 * The first paragraph of a markdown tree as plain text, whitespace
 * collapsed, cut at a word boundary to at most `max` characters (with `…`
 * when cut). Empty when the body has no top-level paragraph.
 *
 * @internal exported for the pipeline + tests
 */
export function excerptOf(tree: Root, max = 200): string {
  for (const node of tree.children) {
    if (node.type !== 'paragraph') continue
    const text = plainText(node).replace(/\s+/g, ' ').trim()
    if (text.length === 0) continue
    if (text.length <= max) return text
    const cut = text.slice(0, max)
    const space = cut.lastIndexOf(' ')
    return `${trimEndChars(space > max / 2 ? cut.slice(0, space) : cut, isExcerptTail)}…`
  }
  return ''
}
