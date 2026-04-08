import { download } from '@pyreon/document'
import { createDocumentExport } from '@pyreon/document-primitives'
import { toast } from '@pyreon/toast'
import { ResumeTemplate } from './ResumeTemplate'
import { useResume } from './store'
import { ExportButton, ToolbarRow } from './styled'

/**
 * Export buttons.
 *
 * Uses `createDocumentExport(templateFn)` from
 * `@pyreon/document-primitives` to bridge the rocketstyle template
 * tree into a `DocNode` tree, then hands the result to
 * `@pyreon/document`'s `download()` helper for any output format.
 *
 * The same `<ResumeTemplate>` component renders the live preview AND
 * gets walked by `extractDocumentTree` here — that's the whole point
 * of the document-primitives bridge. No duplicated layout code.
 */

const FORMATS: Array<{ ext: string; label: string; emoji: string }> = [
  { ext: 'html', label: 'HTML', emoji: '📄' },
  { ext: 'md', label: 'Markdown', emoji: '📝' },
  { ext: 'pdf', label: 'PDF', emoji: '📕' },
  { ext: 'docx', label: 'DOCX', emoji: '📘' },
]

export function ExportButtons() {
  const r = useResume()

  async function exportAs(ext: string) {
    const resume = r.store.resume()
    const slug = resume.name.toLowerCase().replace(/\s+/g, '-') || 'resume'
    const filename = `${slug}.${ext}`
    const loadingId = toast.loading(`Generating ${ext.toUpperCase()}…`)

    try {
      // Build a fresh export wrapper for this render. The template fn
      // is invoked by `createDocumentExport` to produce a VNode tree,
      // which then walks through `extractDocumentTree` to a DocNode.
      const exportHelper = createDocumentExport(() => ResumeTemplate({ resume }))
      const tree = exportHelper.getDocNode()
      await download(tree, filename)
      toast.update(loadingId, { type: 'success', message: `Saved ${filename}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed'
      toast.update(loadingId, { type: 'error', message })
    }
  }

  return (
    <ToolbarRow>
      {FORMATS.map((fmt) => (
        <ExportButton type="button" onClick={() => exportAs(fmt.ext)}>
          {fmt.emoji} {fmt.label}
        </ExportButton>
      ))}
    </ToolbarRow>
  )
}
