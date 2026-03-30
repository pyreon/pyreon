import type { DocNode, ExtractOptions } from '@pyreon/connector-document'
import { extractDocumentTree } from '@pyreon/connector-document'

export interface DocumentExportOptions extends ExtractOptions {
  /** Theme object to provide during extraction. */
  theme?: Record<string, unknown>
  /** Mode: 'light' or 'dark'. */
  mode?: 'light' | 'dark'
}

export interface DocumentExport {
  /** Extract the DocNode tree from the template. */
  getDocNode: () => DocNode
}

/**
 * Create a document export helper from a template function.
 *
 * The template function should return a VNode tree built with
 * document primitives (DocHeading, DocText, DocTable, etc.).
 *
 * ```ts
 * const doc = createDocumentExport(() =>
 *   DocDocument({ title: 'Report', children: [
 *     DocHeading({ h1: true, children: 'Sales Report' }),
 *     DocText({ children: 'Q4 summary.' }),
 *   ]})
 * )
 *
 * const tree = doc.getDocNode()
 * // Pass to @pyreon/document's render() for any format
 * ```
 *
 * When @pyreon/document is published, this will also expose
 * convenience methods like toPdf(), toDocx(), download(), etc.
 */
export function createDocumentExport(
  templateFn: () => unknown,
  options: DocumentExportOptions = {},
): DocumentExport {
  const getDocNode = (): DocNode => {
    const vnode = templateFn()
    return extractDocumentTree(vnode, options)
  }

  return { getDocNode }
}
