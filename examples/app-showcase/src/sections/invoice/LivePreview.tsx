import { effect, signal } from '@pyreon/reactivity'
import { render } from '@pyreon/document'
import { PreviewFrame, PreviewLabel } from './styled'
import { useInvoice } from './store'
import { buildInvoiceDoc } from './template'

/**
 * Live HTML preview of the invoice document.
 *
 * On every change to the invoice store, we rebuild the `DocNode` tree
 * and call `render(doc, 'html')` to get a fully-styled HTML string,
 * then inject it into the preview pane via `innerHTML`. The same tree
 * is what the export buttons feed to the PDF / DOCX renderers — so
 * what you see is exactly what you'll download.
 *
 * Why innerHTML and not Pyreon JSX:
 *   • The HTML produced by `@pyreon/document`'s renderer is already
 *     complete (tables, headings, totals — everything). Re-mapping
 *     it to Pyreon JSX would duplicate every primitive.
 *   • The renderer's output comes from inside the framework, so
 *     there's no XSS risk to gate behind a sanitization step.
 */
export function LivePreview() {
  const inv = useInvoice()
  const html = signal<string>('')

  // Rebuild the document HTML on every invoice change. The render is
  // async (the HTML renderer is itself a promise), so we track a
  // generation counter to discard out-of-order results — when the
  // user types fast, an earlier render might resolve AFTER a later
  // one and overwrite the current preview with stale HTML otherwise.
  let generation = 0
  effect(() => {
    const tree = buildInvoiceDoc(inv.store.invoice())
    const gen = ++generation
    render(tree, 'html')
      .then((result) => {
        if (gen !== generation) return // a newer render is in flight
        if (typeof result === 'string') html.set(result)
      })
      .catch((error) => {
        // oxlint-disable-next-line no-console
        console.error('[invoice] preview render failed', error)
      })
  })

  let frameEl: HTMLElement | null = null
  const setFrameRef = (el: HTMLElement | null) => {
    frameEl = el
  }

  // Mirror the html signal into the DOM via innerHTML.
  effect(() => {
    const value = html()
    if (frameEl) frameEl.innerHTML = value
  })

  return (
    <>
      <PreviewLabel>
        <span>Live preview</span>
        <span>{() => `${inv.store.invoice().items.length} line items`}</span>
      </PreviewLabel>
      <PreviewFrame innerRef={setFrameRef} />
    </>
  )
}
