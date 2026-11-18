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


/**
 * Extract a DocNode tree from a template function, to feed into
 * `@pyreon/document`'s `render()` or `download()`.
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
 */
export function extractDocNode(
  templateFn: () => unknown,
  options: DocumentExportOptions = {},
): DocNode {
  const resolveVar = buildResolveVar(options)
  return extractDocumentTree(templateFn(), resolveVar ? { ...options, resolveVar } : options)
}
