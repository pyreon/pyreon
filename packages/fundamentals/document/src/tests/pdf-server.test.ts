// @vitest-environment node
/**
 * Server-side PDF rendering — no DOM, no Web `Worker`.
 *
 * Since pdfmake 0.3.12 its BROWSER build decodes PNG images through fflate's
 * async path, which spawns a Web `Worker`. On Node/Bun/Deno there is none, so
 * any server-side PDF containing a PNG threw `Worker is not defined`. The
 * renderer now loads pdfmake's Node entry on the server, which decodes with
 * `zlib`. This file runs in vitest's `node` environment on purpose: the rest
 * of the suite runs under happy-dom, where the browser build is used.
 */
import { Document, Image, Page, Text, render } from '../index'

// 1×1 RGBA PNG — the alpha channel is what routes decoding through the
// async inflate in pdfmake 0.3.12's browser build.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('PDF renderer on the server', () => {
  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined')
  })

  it('renders a document containing a PNG image', async () => {
    const doc = Document({
      title: 'Server PDF',
      children: Page({
        children: [Text({ children: 'hello' }), Image({ src: PNG, width: 10, height: 10 })],
      }),
    })
    const pdf = (await render(doc, 'pdf')) as Uint8Array
    expect(pdf).toBeInstanceOf(Uint8Array)
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-')
  })
})
