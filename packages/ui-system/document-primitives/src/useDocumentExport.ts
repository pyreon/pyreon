import type { DocNode, ExtractOptions, VarResolver } from '@pyreon/connector-document'
import { extractDocumentTree } from '@pyreon/connector-document'
import { resolveModeVar } from '@pyreon/rocketstyle'
import { resolveCssVarReferences, themeToCssVars } from '@pyreon/unistyle'

export interface DocumentExportOptions extends ExtractOptions {
  /**
   * Theme to resolve CSS-variable style values against during extraction.
   * Required (with the app under `init({ cssVariables: true })`) to inline
   * theme-leaf `var(--px-...)` references in the exported document;
   * `mode(a, b)` pairs resolve without it. Ignored when an explicit
   * `resolveVar` is supplied.
   */
  theme?: Record<string, unknown>
  /** Active mode for resolving `mode(a, b)` var pairs. Default `'light'`. */
  mode?: 'light' | 'dark'
}

/**
 * Auto-build a `resolveVar` from `theme` + `mode` when the caller didn't
 * supply one. Resolves `mode(a, b)` pairs (always, via rocketstyle's global
 * registry) and theme-leaf `var(--px-...)` refs (when `theme` is given, via a
 * `themeToCssVars` registry). Cheap under the classic path — it only rewrites
 * strings that contain `var(`.
 */
function buildResolveVar(options: DocumentExportOptions): VarResolver | undefined {
  if (options.resolveVar) return options.resolveVar
  if (options.theme === undefined && options.mode === undefined) return undefined
  const mode = options.mode ?? 'light'
  const registry = options.theme ? themeToCssVars(options.theme).registry : undefined
  return (value: unknown) => {
    const afterMode = resolveModeVar(value, mode)
    return registry ? resolveCssVarReferences(afterMode, registry) : afterMode
  }
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
  const resolveVar = buildResolveVar(options)
  return extractDocumentTree(templateFn(), resolveVar ? { ...options, resolveVar } : options)
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
