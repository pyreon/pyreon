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
 * One-step helper: extract a DocNode tree from a template function.
 *
 * Equivalent to `createDocumentExport(templateFn).getDocNode()` but
 * without the wrapper-object indirection. Use this when you just
 * need the tree to feed into `@pyreon/document`'s `render()` or
 * `download()` — which is the only thing the wrapper object was
 * ever used for in practice.
 *
 * ```ts
 * import { extractDocNode } from '@pyreon/document-primitives'
 * import { download } from '@pyreon/document'
 *
 * function ResumeTemplate({ resume }: { resume: () => Resume }) {
 *   return (
 *     <DocDocument title={() => `${resume().name} — Resume`}>
 *       <DocPage>...</DocPage>
 *     </DocDocument>
 *   )
 * }
 *
 * // Export click handler:
 * const tree = extractDocNode(() => <ResumeTemplate resume={store.resume} />)
 * await download(tree, 'resume.pdf')
 * ```
 *
 * The two-step `createDocumentExport` form is still exported for
 * backward compatibility and for callers that want to pass the
 * helper object around (e.g. to wrapper components that take a
 * `DocumentExport` instance). New code should prefer this one-step
 * form unless you specifically need the helper object.
 */
export function extractDocNode(
  templateFn: () => unknown,
  options: DocumentExportOptions = {},
): DocNode {
  return extractDocumentTree(templateFn(), options)
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
 * **Most consumers should use `extractDocNode(templateFn)` instead**
 * — it's the same operation in one call without the wrapper
 * object. `createDocumentExport` is kept for callers that want to
 * pass the helper object around.
 */
export function createDocumentExport(
  templateFn: () => unknown,
  options: DocumentExportOptions = {},
): DocumentExport {
  const getDocNode = (): DocNode => extractDocNode(templateFn, options)
  return { getDocNode }
}
