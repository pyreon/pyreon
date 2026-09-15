/**
 * `<script>` / `<style>` children are RAW TEXT to the HTML parser — character
 * references are never decoded inside them. `renderNode`'s `escapeHtml` on
 * those children therefore shipped `.b &gt; i` (an invalid selector, rule
 * dropped) and `a &amp;&amp; b` (a SyntaxError at script-eval) as LITERAL
 * characters — every server-rendered inline style/script was corrupted. The
 * renderer now applies the raw-text-safe escape React's Fizz uses: only the
 * element's own end tag (and, for script, the `<script`/`<!--` double-escape
 * opener) is neutralised, with `s` so the escaped script still parses.
 */
import { h } from '@pyreon/core'
import { renderToString, renderToStream } from '../index'

async function stream(vnode: ReturnType<typeof h>): Promise<string> {
  const chunks: string[] = []
  const s = renderToStream(vnode)
  const reader = s.getReader()
  const dec = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(typeof value === 'string' ? value : dec.decode(value))
  }
  return chunks.join('')
}

const css = '.a > b { x: "<" }\n.c { y: 1 }'
const js = 'if (a && b < c) x("<b>")'

describe('raw-text elements serialize their content unescaped', () => {
  it('<style> text is emitted verbatim (string mode)', async () => {
    expect(await renderToString(h('style', null, css))).toBe(`<style>${css}</style>`)
  })

  it('<script> text is emitted verbatim (string mode)', async () => {
    expect(await renderToString(h('script', null, js))).toBe(`<script>${js}</script>`)
  })

  it('an accessor / number / array child is collected too', async () => {
    expect(await renderToString(h('style', null, () => css))).toBe(`<style>${css}</style>`)
    expect(await renderToString(h('script', null, ['a', 1, () => 'b']))).toBe('<script>a1b</script>')
  })

  it('the stream path matches the string path byte-for-byte', async () => {
    const v = h('div', null, h('style', null, css), h('script', null, js))
    expect(await stream(v)).toBe(await renderToString(v))
  })

  it('escapable raw text (<textarea>/<title>) keeps the full escape', async () => {
    expect(await renderToString(h('title', null, 'a < b'))).toBe('<title>a &lt; b</title>')
  })
})

describe('only the break-out sequences are neutralised', () => {
  it('`</style` inside a style cannot close the element', async () => {
    const out = await renderToString(h('style', null, 'x { content: "</style><img onerror=1>" }'))
    expect(out).not.toContain('</style><img')
    expect(out).toContain('<\\/style><img')
  })

  it('`</script`, `<script` and `<!--<script` inside a script cannot break out', async () => {
    const out = await renderToString(h('script', null, 'x("</script><!--<script>")'))
    expect(out).toBe('<script>x("</\\u0073cript><!--<\\u0073cript>")</script>')
  })

  it('a VNode child keeps the ordinary path', async () => {
    expect(await renderToString(h('style', null, h('b', null, 'x')))).toBe('<style><b>x</b></style>')
  })
})

describe('accessor children of a raw-text element are invoked exactly once', () => {
  // SSR is one-shot: a function child is called once at render time. The
  // raw-text probe used to invoke every accessor to see whether it was
  // text-shaped and, when one returned a VNode, hand the ORIGINAL children to
  // the ordinary path — which invoked the accessor a second time (a duplicated
  // side effect, and a divergent render for a non-idempotent accessor).
  it('a VNode-returning accessor inside <style> runs once (string mode)', async () => {
    let calls = 0
    const child = () => {
      calls++
      return h('b', null, 'x')
    }
    const out = await renderToString(h('style', null, 'p{}', child))
    expect(calls).toBe(1)
    expect(out).toContain('<b>x</b>')
  })

  it('a VNode-returning accessor inside <script> runs once (stream mode)', async () => {
    let calls = 0
    const child = () => {
      calls++
      return h('b', null, 'x')
    }
    const out = await stream(h('script', null, 'a', child))
    expect(calls).toBe(1)
    expect(out).toContain('<b>x</b>')
  })

  it('a non-idempotent accessor renders its FIRST value', async () => {
    let n = 0
    const child = () => (++n === 1 ? h('i', null, 'first') : h('i', null, 'second'))
    const out = await renderToString(h('style', null, 'p{}', child))
    expect(out).toContain('first')
    expect(out).not.toContain('second')
  })
})
