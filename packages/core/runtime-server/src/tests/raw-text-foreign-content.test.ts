/**
 * `<script>` / `<style>` are raw text ONLY in the HTML namespace. Inside
 * `<svg>` / `<math>` the parser is in foreign content: their text is tokenized
 * as markup (so `<img …>` is a tag — an HTML breakout tag that pops out of the
 * SVG as a live element) and character references are decoded. The raw-text
 * escape, which neutralises only the element's own end tag, therefore let
 * user text inside an SVG/MathML `<style>`/`<script>` inject HTML.
 *
 * The oracle here is structural: between the open and close tag of the
 * raw-text element there must be no `<` that can open a tag (`<` + letter or
 * `/`), in ANY namespace — and the content must decode back to the original
 * text under that namespace's rules.
 */
import { h } from '@pyreon/core'
import { _escSole, _ssr, renderToStream, renderToString } from '../index'

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '</style><img src=x onerror=alert(1)>',
  '</script><img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '</svg><img src=x onerror=alert(1)>',
  '<IMG SRC=x ONERROR=alert(1)>',
  '<!--<script>x</script>-->',
]

async function stream(vnode: ReturnType<typeof h>): Promise<string> {
  const reader = renderToStream(vnode).getReader()
  const dec = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += typeof value === 'string' ? value : dec.decode(value)
  }
  return out
}

/** The text between the FIRST `<tag>` and the LAST `</tag>` in `html`. */
function body(html: string, tag: string): string {
  const open = html.indexOf(`<${tag}>`)
  const close = html.lastIndexOf(`</${tag}>`)
  expect(open).toBeGreaterThanOrEqual(0)
  expect(close).toBeGreaterThan(open)
  return html.slice(open + tag.length + 2, close)
}

const TAG_OPEN = /<[A-Za-z/]/

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

describe('raw-text content inside foreign content (svg / math) cannot open a tag', () => {
  for (const ns of ['svg', 'math'] as const) {
    for (const payload of PAYLOADS) {
      it(`<${ns}><style> ${JSON.stringify(payload)} — string, stream, compiled hole`, async () => {
        const tree = () => h(ns, null, h('style', null, payload))
        const outputs = [
          await renderToString(tree()),
          await stream(tree()),
          // What the compiler emits for `<svg>{child}</svg>` under ssrTemplate:
          // the `<svg>` is baked static text, so the child hole carries the
          // baked namespace path (`"s"` / `"m"`).
          await renderToString(
            h(
              () =>
                _ssr(
                  [`<${ns}>`, `</${ns}>`],
                  _escSole(h('style', null, payload), ns === 'svg' ? 's' : 'm'),
                ) as never,
              null,
            ),
          ),
        ]
        for (const out of outputs) {
          const text = body(out, 'style')
          expect(text).not.toMatch(TAG_OPEN)
          // Foreign content decodes entities: the stylesheet text is unchanged.
          expect(decodeEntities(text)).toBe(payload)
        }
      })

      it(`<${ns}><script> ${JSON.stringify(payload)} — string and stream`, async () => {
        const tree = () => h(ns, null, h('script', null, payload))
        for (const out of [await renderToString(tree()), await stream(tree())]) {
          const text = body(out, 'script')
          expect(text).not.toMatch(TAG_OPEN)
          // Foreign content decodes entities: the script source is unchanged.
          expect(decodeEntities(text)).toBe(payload)
        }
      })
    }
  }

  it('the namespace reaches script/style rendered through a component and an async boundary', async () => {
    const Inner = async () => {
      await Promise.resolve()
      return h('script', null, '<img src=x onerror=alert(1)>')
    }
    const out = await renderToString(h('svg', null, h('g', null, h(Inner as never, null))))
    expect(body(out, 'script')).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('<foreignObject> returns to HTML: a script there keeps the JavaScript-preserving escape', async () => {
    const js = 'if (a<b && c) x("</script>")'
    const out = await renderToString(
      h('svg', null, h('foreignObject', null, h('script', null, js))),
    )
    expect(body(out, 'script')).toBe('if (a<b && c) x("</\\u0073cript>")')
  })

  it('a script in HTML content is unchanged (no entity escaping of JavaScript)', async () => {
    const js = 'if (a<b && c > 0) run()'
    expect(await renderToString(h('div', null, h('script', null, js)))).toBe(
      `<div><script>${js}</script></div>`,
    )
  })

  it('a style in HTML content keeps CSS that has no tag-opening `<` byte-for-byte', async () => {
    const css = '@media (width < 600px) { .a > b, .c<.d { content: "<" } } <!-- .x{} -->'
    expect(await renderToString(h('style', null, css))).toBe(`<style>${css}</style>`)
  })
})
