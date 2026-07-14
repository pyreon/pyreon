import { getTextContent } from '../nodes'
import type { DocNode, DocumentRenderer, NodeType, RenderOptions } from '../types'

/**
 * JSON renderer — serializes the format-agnostic `DocNode` tree verbatim.
 *
 * This is the machine-readable IR: the output is **round-trippable** —
 * `JSON.parse(result)` yields a `DocNode` that `render()` accepts again, into
 * any other format. Useful for inspection, storage, diffing document trees,
 * caching a resolved tree, or feeding another tool.
 *
 * @example
 * ```ts
 * const json = await render(doc, 'json')      // pretty-printed DocNode tree
 * const tree = JSON.parse(json)               // → DocNode
 * const html = await render(tree, 'html')     // round-trips into any format
 * ```
 */
export const jsonRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    return JSON.stringify(node, null, 2)
  },
}

// ─── JSONL ──────────────────────────────────────────────────────────────────

/** Structural containers — traversed but never emitted as their own line. */
const CONTAINER_TYPES = new Set<NodeType>(['document', 'page', 'section', 'row', 'column'])

interface JsonlBlock {
  type: NodeType
  text?: string
  items?: string[]
  [key: string]: unknown
}

/**
 * Depth-first walk that flattens the tree to content blocks in document order.
 * Structural containers are traversed (never emitted); every other node emits
 * exactly one block carrying its `type`, its own props, and — for text-bearing
 * nodes — the flattened `text`. `list` nodes additionally get a flat `items`
 * array. Children/styles never leak (only `props` is spread).
 */
function collectBlocks(node: DocNode, out: JsonlBlock[]): void {
  if (CONTAINER_TYPES.has(node.type)) {
    for (const child of node.children) {
      if (typeof child !== 'string') collectBlocks(child, out)
    }
    return
  }

  const block: JsonlBlock = { type: node.type, ...node.props }

  if (node.type === 'list') {
    block.items = node.children
      .filter((c): c is DocNode => typeof c !== 'string')
      .map((item) => getTextContent(item.children))
  } else {
    const text = getTextContent(node.children)
    if (text) block.text = text
  }

  out.push(block)
}

/**
 * JSONL (newline-delimited JSON) renderer — one JSON object per line, one line
 * per **content block** in document order. Structural containers (document,
 * page, section, row, column) are flattened away.
 *
 * The flat block stream is the standard shape for ingestion pipelines: chunking
 * for embeddings / RAG, streaming to a log sink, or feeding an LLM. For the full
 * structural tree (with metadata + nesting preserved) use the `json` format.
 *
 * @example
 * ```ts
 * const jsonl = await render(doc, 'jsonl')
 * const blocks = jsonl.split('\n').map((l) => JSON.parse(l))
 * // → [{ type: 'heading', level: 1, text: 'Report' }, { type: 'text', text: '…' }, …]
 * ```
 */
export const jsonlRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    const blocks: JsonlBlock[] = []
    collectBlocks(node, blocks)
    return blocks.map((b) => JSON.stringify(b)).join('\n')
  },
}
