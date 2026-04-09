import { download } from '@pyreon/document'
import { extractDocNode } from '@pyreon/document-primitives'
import { toast } from '@pyreon/toast'
import { ResumeTemplate } from './ResumeTemplate'
import { useResume } from './store'
import { ExportButton, ToolbarRow } from './styled'

/**
 * Export buttons.
 *
 * Uses `extractDocNode(templateFn)` from `@pyreon/document-primitives`
 * — the one-step form that replaces the older
 * `createDocumentExport(...).getDocNode()` two-step pattern. The
 * same `<ResumeTemplate>` component renders the live preview AND
 * gets walked by `extractDocNode` here, so the export is always
 * the exact tree the user sees on screen. No duplicated layout
 * code.
 *
 * `DocDocument`'s `title` and `author` are passed as accessor
 * thunks inside ResumeTemplate, and `extractDocumentTree` resolves
 * them at extraction time — so each export click reads the LIVE
 * resume name from the store rather than a value frozen at template
 * mount.
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
      // One-step extraction. ResumeTemplate accepts a Resume snapshot
      // OR a `() => Resume` accessor; passing the snapshot is fine
      // here because each export click captures the current value.
      const tree = extractDocNode(() => ResumeTemplate({ resume }))
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
