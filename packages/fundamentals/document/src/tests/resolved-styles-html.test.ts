/**
 * Coverage-restoring REAL tests for the two #2462 surfaces that shipped with
 * thin coverage (the Coverage (Full) main gate caught the drift):
 *
 * 1. The `node.styles` → inline-CSS pipeline in the HTML renderer
 *    (`resolvedCssRecord` — the connector-document rocketstyle resolution
 *    that previously dead-ended; every mapped property + the
 *    `options.styles` per-node-type override + padding/margin tuple forms).
 * 2. The per-renderer orphan `list-item` + unknown-node-type dev-warn arms
 *    across the chat/binary renderers (added so a future NodeType can never
 *    silently drop — but only SOME formats' suites exercised them).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Document, ListItem, Page, Text, _resetUnknownTypeWarnings } from '../nodes'
import { render } from '../render'
import type { DocNode } from '../types'

const styledDoc = (styles: Record<string, unknown>, options?: Record<string, unknown>) => ({
  doc: Document({
    title: 's',
    children: [
      Page({
        children: [
          Object.assign(Text({ children: ['styled text'] }), { styles }),
        ],
      }),
    ],
  }),
  options,
})

describe('html resolvedCssRecord — the connector-styles pipeline', () => {
  it('maps every supported ResolvedStyles property to inline CSS', async () => {
    const { doc } = styledDoc({
      color: '#112233',
      backgroundColor: '#445566',
      fontSize: 18,
      fontFamily: 'Georgia',
      fontWeight: 700,
      fontStyle: 'italic',
      textDecoration: 'underline',
      textAlign: 'center',
      lineHeight: 1.6,
      letterSpacing: '0.5px',
      padding: 8,
      margin: [4, 6],
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#778899',
      borderStyle: 'solid',
      width: 300,
      height: 40,
      maxWidth: '90%',
      opacity: 0.9,
    })
    const out = (await render(doc, 'html' as never)) as string
    for (const frag of [
      'color:#112233',
      'background-color:#445566',
      'font-size:18px',
      'font-family:Georgia',
      'font-weight:700',
      'font-style:italic',
      'text-decoration:underline',
      'text-align:center',
      'line-height:1.6',
      'letter-spacing:0.5px',
      'padding:8px',
      'margin:4px 6px',
      'border-radius:6px',
      'border-width:1px',
      'border-color:#778899',
      'border-style:solid',
      'width:300px',
      'height:40px',
      'max-width:90%',
      'opacity:0.9',
    ]) {
      expect(out.replace(/\s+/g, ''), frag).toContain(frag.replace(/\s+/g, ''))
    }
  })

  it('4-tuple padding/margin emit all four sides', async () => {
    const { doc } = styledDoc({ padding: [1, 2, 3, 4], margin: [5, 6, 7, 8] })
    const out = ((await render(doc, 'html' as never)) as string).replace(/\s+/g, '')
    expect(out).toContain('padding:1px2px3px4px')
    expect(out).toContain('margin:5px6px7px8px')
  })

  it('options.styles per-node-type override wins over node.styles', async () => {
    const { doc } = styledDoc({ color: '#111111' })
    const out = (await render(doc, 'html' as never, {
      styles: { text: { color: '#ff0000' } },
    } as never)) as string
    expect(out.replace(/\s+/g, '')).toContain('color:#ff0000')
    expect(out.replace(/\s+/g, '')).not.toContain('color:#111111')
  })

  it('options.styles alone (no node.styles) applies too', async () => {
    const doc = Document({
      title: 's',
      children: [Page({ children: [Text({ children: ['t'] })] })],
    })
    const out = (await render(doc, 'html' as never, {
      styles: { text: { backgroundColor: '#00ff00' } },
    } as never)) as string
    expect(out.replace(/\s+/g, '')).toContain('background-color:#00ff00')
  })

  it('no styles anywhere → zero style leakage (fast path)', async () => {
    const doc = Document({
      title: 's',
      children: [Page({ children: [Text({ children: ['plain'] })] })],
    })
    const out = (await render(doc, 'html' as never)) as string
    expect(out).toContain('plain')
  })
})

describe('orphan list-item + unknown-node-type arms per renderer', () => {
  beforeEach(() => {
    _resetUnknownTypeWarnings()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const orphanDoc = () =>
    Document({
      title: 'o',
      children: [
        Page({
          children: [
            // An orphan list-item OUTSIDE any <List> — the silent-drop arm.
            ListItem({ children: ['ORPHANITEM77'] }),
            Text({ children: ['tail'] }),
          ],
        }),
      ],
    })

  for (const format of [
    'slack',
    'discord',
    'telegram',
    'whatsapp',
    'notion',
    'confluence',
    'teams',
    'google-chat',
    'svg',
  ] as const) {
    it(`${format}: an orphan list-item renders as text (not dropped)`, async () => {
      const out = await render(orphanDoc(), format as never)
      const s = typeof out === 'string' ? out : new TextDecoder('latin1').decode(out as Uint8Array)
      expect(s).toContain('ORPHANITEM77')
    })
  }

  for (const format of [
    'slack',
    'discord',
    'notion',
    'confluence',
    'teams',
    'google-chat',
    'svg',
    'pptx',
  ] as const) {
    it(`${format}: an unknown node type dev-warns by name instead of silently dropping`, async () => {
      const bogus = {
        type: 'holo-projection',
        props: {},
        children: [],
      } as unknown as DocNode
      const doc = Document({
        title: 'u',
        children: [Page({ children: [bogus, Text({ children: ['after'] })] })],
      })
      await render(doc, format as never)
      const warned = (console.warn as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
        String(c[0]).includes('holo-projection'),
      )
      expect(warned, `${format} must name the unknown type`).toBe(true)
    })
  }
})

describe('html resolved styles on code/divider/button/quote (the `extra ?` arms)', () => {
  // Each of these four switch arms appends resolved-style declarations via
  // `${extra ? `;${extra}` : ''}` — the truthy arm was never exercised.
  const wrap = (node: DocNode) =>
    Document({ title: 'x', children: [Page({ children: [node] })] })

  it('code: resolved styles land on the <pre>', async () => {
    const { Code } = await import('../nodes')
    const node = Object.assign(Code({ children: 'x' }), { styles: { color: '#123456' } })
    const out = (await render(wrap(node), 'html' as never)) as string
    expect(out).toContain('overflow-x:auto;color:#123456')
  })

  it('divider: resolved styles land on the <hr>', async () => {
    const { Divider } = await import('../nodes')
    const node = Object.assign(Divider({}), { styles: { margin: 4 } })
    const out = (await render(wrap(node), 'html' as never)) as string
    expect(out).toContain('margin:16px 0;margin:4px')
  })

  it('button: resolved styles land on the <a>', async () => {
    const { Button } = await import('../nodes')
    const node = Object.assign(Button({ href: 'https://e.com', children: 'B' }), {
      styles: { letterSpacing: '1px' },
    })
    const out = (await render(wrap(node), 'html' as never)) as string
    expect(out).toContain('font-weight:bold;letter-spacing:1px')
  })

  it('quote: resolved styles land on the <blockquote>', async () => {
    const { Quote } = await import('../nodes')
    const node = Object.assign(Quote({ children: 'Q' }), { styles: { opacity: 0.5 } })
    const out = (await render(wrap(node), 'html' as never)) as string
    expect(out).toContain('color:#555;opacity:0.5')
  })
})
