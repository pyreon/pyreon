/**
 * SSR hot-path optimization locks (the bench-ssr.ts profiling campaign).
 *
 * Each optimization is a behavior-equivalent rewrite; these specs lock the
 * EDGE cases of the new implementations so a future change can't silently
 * narrow them — most critically the comment-safety contract of the
 * `safeKeyForMarker` fast paths (a `--` reaching markup inside
 * `<!--k:KEY-->` would break out of the comment).
 */
import { h, For } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { decodeKeyFromMarker, renderToString } from '../index'

async function render(node: unknown): Promise<string> {
  return (await renderToString(node as never)) as string
}

describe('escapeHtml — charCode-scan dirty path', () => {
  it('escapes all five entities, mixed with clean runs', async () => {
    const html = await render(h('p', null, `a<b>&"c'd & <script>`))
    expect(html).toBe('<p>a&lt;b&gt;&amp;&quot;c&#39;d &amp; &lt;script&gt;</p>')
  })

  it('entity-only and entity-at-edges strings', async () => {
    expect(await render(h('i', null, '&'))).toBe('<i>&amp;</i>')
    expect(await render(h('i', null, '<<>>'))).toBe('<i>&lt;&lt;&gt;&gt;</i>')
    expect(await render(h('i', null, '<x'))).toBe('<i>&lt;x</i>')
    expect(await render(h('i', null, 'x>'))).toBe('<i>x&gt;</i>')
  })

  it('clean strings (incl. unicode) pass through verbatim', async () => {
    expect(await render(h('i', null, 'čeština — emoji 🔥 ok'))).toBe('<i>čeština — emoji 🔥 ok</i>')
  })

  it('attribute values escape identically', async () => {
    const html = await render(h('div', { title: `a"b<c>&'` }))
    expect(html).toBe('<div title="a&quot;b&lt;c&gt;&amp;&#39;"></div>')
  })
})

describe('safeKeyForMarker — fast paths keep the comment-safety contract', () => {
  const list = (keys: unknown[]) =>
    h(For as never, {
      each: () => keys,
      by: (k: unknown) => k,
      children: (k: unknown) => h('li', null, String(k)),
    } as never)

  it('numeric keys (incl. negative + float + exponent) emit verbatim — never form --', async () => {
    const html = await render(h('ul', null, list([0, -5, 1.5, 1e-7])))
    expect(html).toContain('<!--k:0-->')
    expect(html).toContain('<!--k:-5-->')
    expect(html).toContain('<!--k:1.5-->')
    expect(html).toContain('<!--k:1e-7-->')
  })

  it('simple word keys emit verbatim and roundtrip through decodeKeyFromMarker', async () => {
    const html = await render(h('ul', null, list(['abc', 'a_b.c:d', 'ID42'])))
    expect(html).toContain('<!--k:abc-->')
    expect(html).toContain('<!--k:a_b.c:d-->')
    expect(decodeKeyFromMarker('a_b.c:d')).toBe('a_b.c:d')
  })

  it('SECURITY: dash-bearing keys still encode — a `-->` payload can NEVER close the comment early', async () => {
    const evil = 'x--><script>alert(1)</script>'
    const html = await render(h('ul', null, list([evil, 'a--b', 'uuid-550e-8400'])))
    // No raw early-closing sequence from the key payload:
    expect(html).not.toContain('<!--k:x-->')
    expect(html).not.toContain('--><script>')
    // The dashes are %2D-encoded so `-->` is structurally impossible:
    expect(html).toContain('%2D%2D%3E')
    expect(html).toContain('<!--k:a%2D%2Db-->')
    expect(html).toContain('<!--k:uuid%2D550e%2D8400-->')
    // And the encoding roundtrips:
    expect(decodeKeyFromMarker('a%2D%2Db')).toBe('a--b')
    expect(decodeKeyFromMarker('x%2D%2D%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')).toBe(evil)
  })

  it('percent signs are not in the fast path (would corrupt decode)', async () => {
    const html = await render(h('ul', null, list(['50%off'])))
    expect(html).toContain('<!--k:50%25off-->')
    expect(decodeKeyFromMarker('50%25off')).toBe('50%off')
  })
})

describe('isVoidElement — no-allocation probe keeps mixed-case support', () => {
  it('lowercase void tags self-close', async () => {
    expect(await render(h('br', null))).toBe('<br />')
    expect(await render(h('img', { src: '/x.png', alt: '' }))).toBe('<img src="/x.png" alt="" />')
  })

  it('mixed-case void tags (h() callers) still resolve via the fallback', async () => {
    expect(await render(h('BR' as never, null))).toBe('<BR />')
  })

  it('non-void lowercase tags get a closing tag', async () => {
    expect(await render(h('div', null))).toBe('<div></div>')
  })
})

describe('toAttrName memo + renderPropSkipped charCode probe', () => {
  it('camelCase fallback kebabs consistently across repeated renders (memo identity)', async () => {
    const a = await render(h('div', { dataTestId: 'x' } as never))
    const b = await render(h('div', { dataTestId: 'y' } as never))
    expect(a).toBe('<div data-test-id="x"></div>')
    expect(b).toBe('<div data-test-id="y"></div>')
  })

  it('boolean-true props emit the bare (pre-escaped) attr name', async () => {
    expect(await render(h('input', { disabled: true }))).toBe('<input disabled />')
  })

  it('on[A-Z] event props are skipped; on-prefixed NON-events are kept', async () => {
    const html = await render(
      h('button', { onClick: () => {}, once: 'x', onyx: 'y' } as never),
    )
    expect(html).not.toContain('onClick')
    expect(html).toContain('once="x"')
    expect(html).toContain('onyx="y"')
  })
})
