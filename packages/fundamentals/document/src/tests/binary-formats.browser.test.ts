import { Document, Heading, Page, render, Table, Text } from '../index'

// The binary renderers (DOCX, XLSX, PPTX, PDF) must work where `download()`
// runs: a real browser. happy-dom runs them under Node, where `Buffer` exists,
// so a Node-only output path (docx's `Packer.toBuffer`, which needs JSZip's
// `nodebuffer`) passed every node test and failed in Chromium with
// "nodebuffer is not supported by this platform".

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] // 'PK\x03\x04'
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] // '%PDF'

function sample() {
  return Document({
    title: 'Browser render',
    children: Page({
      children: [
        Heading({ children: 'Quarterly report' }),
        Text({ children: 'Rendered in a real browser.' }),
        Table({
          columns: ['Region', 'Revenue'],
          rows: [
            ['EU', '1'],
            ['US', '2'],
          ],
        }),
      ],
    }),
  })
}

describe('binary renderers in a real browser', () => {
  it('runs without a Node Buffer global', () => {
    expect((globalThis as { Buffer?: unknown }).Buffer).toBeUndefined()
  })

  it.each(['docx', 'xlsx', 'pptx'] as const)('render(doc, %s) returns a ZIP Uint8Array', async (format) => {
    const out = await render(sample(), format)
    expect(out).toBeInstanceOf(Uint8Array)
    expect(out.byteLength).toBeGreaterThan(1000)
    expect(Array.from(out.subarray(0, 4))).toEqual(ZIP_MAGIC)
  })

  it('render(doc, pdf) returns a PDF Uint8Array', async () => {
    const out = await render(sample(), 'pdf')
    expect(out).toBeInstanceOf(Uint8Array)
    expect(Array.from(out.subarray(0, 4))).toEqual(PDF_MAGIC)
  })
})
