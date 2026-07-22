/**
 * INLINE-LINK RUNS (the focused slice of the rich-text-run model): an inline
 * `<Link href>` inside a `<Text>` paragraph must keep its LINK-ness in the
 * formats that previously flattened it via `getTextContent` — pre-fix the
 * href was silently LOST in pdf, docx, slack, telegram, and whatsapp (the
 * audit's "biggest parity gap" slice with real user impact: a report's
 * inline links died on export).
 *
 * PDF probe: pdfmake emits links as /Annots URI actions in the OBJECT
 * layer, which stays uncompressed even when content streams are deflated —
 * so the URL is byte-greppable in the latin1 dump.
 */
import { describe, expect, it } from 'vitest'
import { getInlineRuns, hasLinkRun, Document, Link, Page, Text } from '../nodes'
import { render } from '../render'
import { unzipDump } from './zip-dump-helper'

const URL = 'https://inline-link-probe.example/path'
const doc = () =>
  Document({
    title: 'links',
    children: [
      Page({
        children: [
          Text({
            children: [
              'Read the ',
              Link({ href: URL, children: ['full report'] }),
              ' before Friday.',
            ],
          }),
        ],
      }),
    ],
  })

describe('getInlineRuns', () => {
  it('splits text children into plain + link runs, merging adjacent plain text', () => {
    const runs = getInlineRuns([
      'a ',
      Link({ href: URL, children: ['label'] }),
      ' b',
      ' c',
    ])
    expect(runs).toEqual([
      { text: 'a ' },
      { text: 'label', href: URL },
      { text: ' b c' },
    ])
    expect(hasLinkRun(runs)).toBe(true)
    expect(hasLinkRun([{ text: 'x' }])).toBe(false)
  })

  it('non-link nested nodes still flatten to text (block-level formatting stays tracked follow-up)', () => {
    const runs = getInlineRuns([Text({ children: ['nested'] }) as never, ' tail'])
    expect(runs).toEqual([{ text: 'nested tail' }])
  })
})

describe('inline links survive per format', () => {
  it('pdf: the URI action carries the href (object layer, uncompressed)', async () => {
    const out = (await render(doc(), 'pdf' as never)) as Uint8Array
    const s = new TextDecoder('latin1').decode(out)
    expect(s).toContain(URL)
  })

  it('docx: an ExternalHyperlink relationship carries the href', async () => {
    const out = (await render(doc(), 'docx' as never)) as Uint8Array
    const dump = unzipDump(out, 'links.docx')
    expect(dump).toContain('<w:hyperlink')
    expect(dump).toContain(URL)
    expect(dump).toContain('full report')
  })

  it('slack: mrkdwn <url|label> inside the paragraph', async () => {
    const out = (await render(doc(), 'slack' as never)) as string
    expect(out).toContain(`<${URL}|full report>`)
    expect(out).toContain('Read the ')
  })

  it('telegram: <a href> inside the paragraph', async () => {
    const out = (await render(doc(), 'telegram' as never)) as string
    expect(out).toContain(`<a href="${URL}">full report</a>`)
  })

  it('whatsapp: degrades to "label (url)" — no link markup exists', async () => {
    const out = (await render(doc(), 'whatsapp' as never)) as string
    expect(out).toContain(`full report (${URL})`)
  })

  it('text: structural recursion already preserved "label (url)" (control)', async () => {
    const out = (await render(doc(), 'text' as never)) as string
    expect(out).toContain(`full report (${URL})`)
  })

  it('zero-link paragraphs keep the old flatten output (fast-path control)', async () => {
    const plain = Document({
      title: 'p',
      children: [Page({ children: [Text({ children: ['just text'] })] })],
    })
    for (const f of ['slack', 'telegram', 'whatsapp'] as const) {
      const out = (await render(plain, f as never)) as string
      expect(out).toContain('just text')
    }
  })
})
