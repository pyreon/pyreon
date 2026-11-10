import type { Nodes, Root } from 'mdast'

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
