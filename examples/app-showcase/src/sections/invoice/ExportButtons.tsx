import { download } from '@pyreon/document'
import { toast } from '@pyreon/toast'
import { ExportBar, ExportButton } from './styled'
import { useInvoice } from './store'
import { buildInvoiceDoc } from './template'

/**
 * Export buttons. Each button rebuilds the DocNode tree (cheap, pure
 * function) and hands it to `@pyreon/document`'s `download()` helper,
 * which renders to the chosen format and triggers a browser download.
 *
 * Heavy renderers (PDF ~300 kB, DOCX ~100 kB) are lazy-loaded by
 * `@pyreon/document` itself — clicking the PDF button is the moment
 * the PDF chunk hits the network, NOT page load. The HTML and
 * Markdown renderers are zero-dependency and ship in the main
 * @pyreon/document chunk.
 */

const FORMATS: Array<{
  ext: string
  label: string
  emoji: string
}> = [
  { ext: 'html', label: 'HTML', emoji: '📄' },
  { ext: 'md', label: 'Markdown', emoji: '📝' },
  { ext: 'pdf', label: 'PDF', emoji: '📕' },
  { ext: 'docx', label: 'DOCX', emoji: '📘' },
]

export function ExportButtons() {
  const inv = useInvoice()

  async function exportAs(ext: string) {
    const invoice = inv.store.invoice()
    const tree = buildInvoiceDoc(invoice)
    const filename = `${invoice.number.toLowerCase()}.${ext}`
    const loadingId = toast.loading(`Generating ${ext.toUpperCase()}…`)
    try {
      await download(tree, filename)
      toast.update(loadingId, { type: 'success', message: `Saved ${filename}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed'
      toast.update(loadingId, { type: 'error', message })
    }
  }

  return (
    <ExportBar>
      {FORMATS.map((fmt) => (
        <ExportButton type="button" onClick={() => exportAs(fmt.ext)}>
          {fmt.emoji} {fmt.label}
        </ExportButton>
      ))}
    </ExportBar>
  )
}
