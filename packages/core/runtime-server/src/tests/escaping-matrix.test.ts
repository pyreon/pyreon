/**
 * The SSR ESCAPING-CONTEXT MATRIX — one table-driven suite for every place
 * user data can land in server-rendered HTML.
 *
 *   contexts  x  render paths  x  payloads
 *
 * Render paths (6): the same JSX source compiled three ways — the runtime
 * `h()` path (`ssr: true`), the compiled `_ssr` template from the JS backend
 * and from the Rust napi backend (`ssr: true, ssrTemplate: true`) — each
 * rendered through `renderToString` AND `renderToStream`. The Rust rows skip
 * exactly the way `compiler/src/tests/native-equivalence.test.ts` does when
 * the binary is not built.
 *
 * Oracle: parse5, i.e. the HTML parser the browser runs. For every payload
 * the output is parsed and compared with the same context rendered with a
 * NEUTRAL payload (`n`):
 *
 *   1. Same element/comment skeleton (tag + namespace + nesting, template
 *      contents included): the payload never becomes a live element, never
 *      swallows one, and never opens or closes a comment.
 *   2. No attribute the author did not write, and never an event-handler
 *      attribute (`EVENT_HANDLER_ATTRS`, every vocabulary).
 *   3. No URL attribute whose value, after the WHATWG URL parser's own
 *      normalisation (`new URL`), has a script scheme (`javascript:`,
 *      `vbscript:`, or `data:` outside a raster image source).
 *   4. Where the context promises it, the parsed text / attribute value
 *      decodes back to the input (after the parser's input-stream CR/NUL
 *      preprocessing).
 *
 * Payloads are a curated attack list plus a seeded random mix of breakout
 * tokens — deterministic, so a failure reproduces from its printed payload.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformJSX_JS } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { EVENT_HANDLER_ATTRS, URL_ATTRS, h } from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { parse } from 'parse5'
import * as server from '../index'
import { decodeKeyFromMarker, renderToStream, renderToString } from '../index'

// ─── Backends ────────────────────────────────────────────────────────────────

type NativeTransform = (
  code: string,
  filename: string,
  ssr: boolean,
  knownSignals: string[] | null,
  reactivityLens?: boolean,
  collapse?: unknown,
  ssrTemplate?: boolean,
) => { code: string }

let nativeTransform: NativeTransform | null = null
try {
  // Same loader as native-equivalence.test.ts: the in-tree napi addon, skip
  // when it is not built.
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  const native = requireAddon(
    join(here, '..', '..', '..', 'compiler', 'native', 'pyreon-compiler.node'),
  ) as { transformJsx: NativeTransform }
  nativeTransform = native.transformJsx
} catch {
  // Native not available — the `rs` rows skip.
}

type Backend = 'h' | 'js' | 'rs'

function compile(src: string, backend: Backend): string {
  if (backend === 'h') return transformJSX_JS(src, 'm.tsx', { ssr: true }).code
  if (backend === 'js') return transformJSX_JS(src, 'm.tsx', { ssr: true, ssrTemplate: true }).code
  return nativeTransform!(src, 'm.tsx', true, null, false, undefined, true).code
}

const MODULES: Record<string, unknown> = {
  '@pyreon/core': core,
  '@pyreon/reactivity': reactivity,
  '@pyreon/runtime-server': server,
}

type App = (p: Record<string, unknown>) => unknown

function load(code: string): App {
  const js = transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: '__h',
    jsxFragment: '__F',
    format: 'cjs',
  }).code
  const mod = { exports: {} as Record<string, unknown> }
  const req = (id: string): unknown => {
    const m = MODULES[id]
    if (!m) throw new Error(`matrix: unexpected import ${id}`)
    return m
  }
  new Function('require', 'module', 'exports', '__h', '__F', js)(
    req,
    mod,
    mod.exports,
    core.h,
    core.Fragment,
  )
  return mod.exports.App as App
}

async function collect(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += value
  }
}

// ─── Payloads ────────────────────────────────────────────────────────────────

let seed = 0x5eed
const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!

const TEXT_TOKENS = [
  '<', '>', '"', "'", '&', '/', '=', ' ', '\t', '\n', '\r\n', 'a', 'Z', '-->', '--!>', '<!--',
  '<!-', '</script', '<script>', '</style', '<style>', '<img src=x onerror=alert(1)>',
  '</textarea>', '</title>', '</svg>', '<svg>', '<math>', '</math>', '<![CDATA[', ']]>', '&lt;',
  '&#60;', '&#x3c;', '&amp;', '\u2028', '\u00a0', 'javascript:', ' onload=', '\\', '${', '`',
  '</template', '<template>', '<\\/', '<!DOCTYPE html>', '<?x ?>', '</', '%2D-', '\\3c ',
  '</foreignObject>', '<foreignObject>', '<p>', '<plaintext>', '<noscript>', '\u0000', '\u0001',
  '😀', 'é', '<SCRIPT>', '</STYLE ', '<!--<script>', '</noscript>', '</iframe>', '</xmp>',
  '</noembed>', '</noframes>',
]

const TEXT_PAYLOADS: string[] = [
  '<img src=x onerror=alert(1)>',
  '</style><img src=x onerror=alert(1)>',
  '</script><img src=x onerror=alert(1)>',
  '</ScRiPt ><img src=x onerror=alert(1)>',
  '<!--<script>x</script>--><img src=x onerror=alert(1)>',
  '--><img src=x onerror=alert(1)>',
  '--!><img src=x onerror=alert(1)>',
  '--><img src=x onerror=alert(1)><!--',
  '<!--',
  '<svg/onload=alert(1)>',
  '</svg><img src=x onerror=alert(1)>',
  '</math><img src=x onerror=alert(1)>',
  '</foreignObject></svg><img src=x onerror=alert(1)>',
  // Every raw-text / RCDATA end tag: a sink nested in one of these ends where
  // the ANCESTOR's text ends.
  ...['textarea', 'title', 'noscript', 'iframe', 'noembed', 'noframes', 'xmp', 'TEXTAREA', 'NoScript'].map(
    (t) => `</${t}><img src=x onerror=alert(1)>`,
  ),
  '"><img src=x onerror=alert(1)>',
  "'><img src=x onerror=alert(1)>",
  '" onmouseover="alert(1)',
  "' onmouseover='alert(1)",
  '<![CDATA[<img src=x onerror=alert(1)>]]>',
  '&lt;img src=x onerror=alert(1)&gt;',
  '&#60;img src=x onerror=alert(1)&#62;',
  '</template><img src=x onerror=alert(1)>',
  '\nleading newline',
  'a\r\nb\rc',
  '',
  ' ',
  'plain text',
]
for (let i = 0; i < 48; i++) {
  let s = ''
  const n = 1 + Math.floor(rnd() * 6)
  for (let k = 0; k < n; k++) s += pick(TEXT_TOKENS)
  TEXT_PAYLOADS.push(s)
}

const SCHEMES = ['javascript', 'vbscript', 'data']
const URL_PAYLOADS: string[] = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  '\u0001javascript:alert(1)',
  '\u0000javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'java\rscript:alert(1)',
  'javascript\t:alert(1)',
  'vbscript:msgbox(1)',
  'VBScript:msgbox(1)',
  ' \tvb\nscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'DATA:text/html,x',
  'data:image/svg+xml,<svg onload=alert(1)>',
  '&#106;avascript:alert(1)',
  '&#x6A;avascript:alert(1)',
  'javascript&colon;alert(1)',
  '%6Aavascript:alert(1)',
  '\u00a0javascript:alert(1)',
  'https://ok.example/?a=1&b=<>"\'',
  '/relative/path',
  '#frag',
  'mailto:a@b.example',
  'data:image/png;base64,iVBORw0KGgo=',
  '',
]
for (let i = 0; i < 40; i++) {
  const word = pick(SCHEMES)
  let s = pick(['', ' ', '\t', '\n', '\u0001', '\u0000', '\u001f', '  \n', '\u000c'])
  for (const ch of word) {
    s += rnd() < 0.5 ? ch.toUpperCase() : ch
    if (rnd() < 0.15) s += pick(['\t', '\n', '\r'])
  }
  s += ':' + pick(['alert(1)', 'text/html,<script>alert(1)</script>', 'msgbox(1)'])
  URL_PAYLOADS.push(s)
}

const NAME_PAYLOADS: string[] = [
  'x" onload="alert(1)',
  "x' onload='alert(1)",
  'a b',
  'a>b',
  'a/onload',
  'a=b',
  '"',
  "'",
  '=',
  '<img',
  'a\u000cb',
  'a\u0000b',
  'onclick',
  'onClick',
  'onCLICK',
  'onerror',
  'onbegin',
  'onend',
  'onrepeat',
  'onmousewheel',
  'onwebkitanimationend',
  'onbeforeload',
  'onzoom',
  'once',
  'onyx',
  'data-ok',
  'title',
  'a\u2028b',
  'x\u00a0onload',
]
const NAME_TOKENS = ['on', 'click', 'load', ' ', '"', "'", '=', '>', '/', '<', 'x', '-', '\t', 'Error']
for (let i = 0; i < 24; i++) {
  let s = ''
  const n = 1 + Math.floor(rnd() * 5)
  for (let k = 0; k < n; k++) s += pick(NAME_TOKENS)
  NAME_PAYLOADS.push(s)
}

// ─── Contexts ────────────────────────────────────────────────────────────────

type Kind =
  | 'text' // p.x = payload (string)
  | 'url' // p.x = URL payload
  | 'name' // p.o = { [payload]: 'v' } (spread attribute NAME)
  | 'styleKey' // p.o = { [payload]: 'red' }
  | 'urlObj' // p.o = { [ctx.key]: URL payload } (spread URL)
  | 'vnode' // p.v = h(ctx.vtag, null, payload); p.list = [p.v]; p.rows = [{ k, v }]
  | 'key' // p.items = [{ k: payload, t }, { k: payload + '\u0001', t }]

interface RoundTrip {
  /** Element (tag + namespace) to read, first in document order. */
  tag: string
  ns?: 'html' | 'svg' | 'math'
  /** Read this attribute; otherwise the element's direct text. */
  attr?: string
  /** Expected value from the payload (default: the payload itself). */
  expect?: (x: string) => string
  /** Input-stream preprocessing for NUL: dropped in body text, U+FFFD elsewhere. */
  nul?: 'drop' | 'replace'
  /**
   * `<pre>` / `<textarea>`: the parser drops ONE leading LF after the start
   * tag. That is a content round-trip gap (not an escaping one) which the
   * renderer does not compensate for yet, so a payload starting with LF skips
   * the round-trip check here; the structural checks still run.
   */
  leadingLf?: true
}

interface Ctx {
  id: string
  body: string
  kind: Kind
  rt?: RoundTrip
  /** The compiled template backends must emit `_ssr(` for this source. */
  tpl?: boolean
  vtag?: 'script' | 'style'
  key?: string
}

// The HTML-namespace script escape: the first letter of a raw-text end-tag name
// (and of `<script`) becomes a `\uXXXX` escape — same JS/JSON meaning.
const ESCAPED_SCRIPT = (x: string) =>
  x.replace(/<(\/?)(script|style|title|textarea|noscript|noembed|noframes|iframe|xmp)/gi, (m, sl: string, n: string) =>
    sl === '' && n.toLowerCase() !== 'script' ? m : `<${sl}\\u${n.charCodeAt(0).toString(16).padStart(4, '0')}${n.slice(1)}`,
  )
const ESCAPED_STYLE = (x: string) => x.replace(/<(?=[A-Za-z/])/g, '\\3c ')

const CONTEXTS: Ctx[] = [
  // Text children.
  { id: 'text/sole', body: '<div>{p.x}</div>', kind: 'text', tpl: true, rt: { tag: 'div', nul: 'drop' } },
  { id: 'text/mixed', body: '<div><b></b>{p.x}<i></i></div>', kind: 'text', tpl: true, rt: { tag: 'div', nul: 'drop' } },
  { id: 'text/fused', body: '<p>a {p.x} b</p>', kind: 'text', tpl: true, rt: { tag: 'p', nul: 'drop', expect: (x) => `a ${x} b` } },
  { id: 'text/accessor', body: '<div>{() => p.x}<b></b></div>', kind: 'text', rt: { tag: 'div', nul: 'drop' } },
  { id: 'text/pre', body: '<pre>{p.x}</pre>', kind: 'text', tpl: true, rt: { tag: 'pre', nul: 'drop', leadingLf: true } },
  // Attribute values (Pyreon only ever emits double-quoted values).
  { id: 'attr/title', body: '<div title={p.x}></div>', kind: 'text', tpl: true, rt: { tag: 'div', attr: 'title' } },
  { id: 'attr/data', body: '<div data-v={p.x}></div>', kind: 'text', tpl: true, rt: { tag: 'div', attr: 'data-v' } },
  { id: 'attr/aria', body: '<div aria-label={p.x}></div>', kind: 'text', tpl: true, rt: { tag: 'div', attr: 'aria-label' } },
  { id: 'attr/camel', body: '<div tabIndex={p.x}></div>', kind: 'text', tpl: true, rt: { tag: 'div', attr: 'tabindex' } },
  { id: 'attr/input-value', body: '<input value={p.x} />', kind: 'text', tpl: true, rt: { tag: 'input', attr: 'value' } },
  { id: 'attr/svg', body: '<svg><path d={p.x}></path></svg>', kind: 'text', tpl: true, rt: { tag: 'path', ns: 'svg', attr: 'd' } },
  // Attribute NAMES from a spread object.
  { id: 'name/div', body: '<div {...p.o}></div>', kind: 'name' },
  { id: 'name/a', body: '<a {...p.o}>x</a>', kind: 'name' },
  { id: 'name/svg', body: '<svg><g {...p.o}></g></svg>', kind: 'name' },
  { id: 'name/math', body: '<math><mi {...p.o}></mi></math>', kind: 'name' },
  // URL attributes.
  ...(
    [
      ['a', 'href'],
      ['a', 'HREF'],
      ['img', 'src'],
      ['form', 'action'],
      ['button', 'formAction'],
      ['button', 'formaction'],
      ['video', 'poster'],
      ['blockquote', 'cite'],
      ['object', 'data'],
      ['iframe', 'src'],
      ['embed', 'src'],
      ['source', 'src'],
    ] as const
  ).map(([tag, attr]): Ctx => ({
    id: `url/${tag}-${attr}`,
    body: ['img', 'embed', 'source'].includes(tag) ? `<${tag} ${attr}={p.x} />` : `<${tag} ${attr}={p.x}>x</${tag}>`,
    kind: 'url',
  })),
  { id: 'url/svg-a-href', body: '<svg><a href={p.x}><text>x</text></a></svg>', kind: 'url' },
  { id: 'url/svg-a-xlinkHref', body: '<svg><a xlinkHref={p.x}><text>x</text></a></svg>', kind: 'url' },
  { id: 'url/svg-a-xlink:href', body: '<svg><a xlink:href={p.x}><text>x</text></a></svg>', kind: 'url' },
  { id: 'url/spread-href', body: '<a {...p.o}>x</a>', kind: 'urlObj', key: 'href' },
  { id: 'url/spread-HREF', body: '<a {...p.o}>x</a>', kind: 'urlObj', key: 'HREF' },
  { id: 'url/spread-formAction', body: '<button {...p.o}>x</button>', kind: 'urlObj', key: 'formAction' },
  { id: 'url/spread-xlinkHref', body: '<svg><a {...p.o}><text>x</text></a></svg>', kind: 'urlObj', key: 'xlinkHref' },
  { id: 'url/spread-xlink:href', body: '<svg><a {...p.o}><text>x</text></a></svg>', kind: 'urlObj', key: 'xlink:href' },
  // Style attribute.
  { id: 'style/string', body: '<div style={p.x}></div>', kind: 'text', tpl: true, rt: { tag: 'div', attr: 'style' } },
  { id: 'style/object-value', body: '<div style={{ color: p.x }}></div>', kind: 'text', rt: { tag: 'div', attr: 'style', expect: (x) => `color: ${x}` } },
  { id: 'style/object-key', body: '<div style={p.o}></div>', kind: 'styleKey' },
  // Raw text (HTML namespace).
  { id: 'raw/script', body: '<script>{p.x}</script>', kind: 'text', rt: { tag: 'script', expect: ESCAPED_SCRIPT } },
  { id: 'raw/script-json', body: '<script type="application/json">{p.x}</script>', kind: 'text', rt: { tag: 'script', expect: ESCAPED_SCRIPT } },
  { id: 'raw/style', body: '<style>{p.x}</style>', kind: 'text', rt: { tag: 'style', expect: ESCAPED_STYLE } },
  // Escapable raw text.
  { id: 'rcdata/textarea-child', body: '<textarea>{p.x}</textarea>', kind: 'text', tpl: true, rt: { tag: 'textarea', leadingLf: true } },
  { id: 'rcdata/textarea-value', body: '<textarea value={p.x}></textarea>', kind: 'text', rt: { tag: 'textarea', leadingLf: true } },
  { id: 'rcdata/title', body: '<title>{p.x}</title>', kind: 'text', tpl: true, rt: { tag: 'title' } },
  // Foreign content (SVG / MathML), and back to HTML through <foreignObject>.
  { id: 'svg/style', body: '<svg><style>{p.x}</style></svg>', kind: 'text', rt: { tag: 'style', ns: 'svg' } },
  { id: 'svg/script', body: '<svg><script>{p.x}</script></svg>', kind: 'text', rt: { tag: 'script', ns: 'svg' } },
  { id: 'svg/title', body: '<svg><title>{p.x}</title></svg>', kind: 'text', tpl: true, rt: { tag: 'title', ns: 'svg', nul: 'drop' } },
  { id: 'svg/text', body: '<svg><text>{p.x}</text></svg>', kind: 'text', tpl: true, rt: { tag: 'text', ns: 'svg' } },
  { id: 'math/mi', body: '<math><mi>{p.x}</mi></math>', kind: 'text', tpl: true, rt: { tag: 'mi', ns: 'math', nul: 'drop' } },
  { id: 'math/style', body: '<math><style>{p.x}</style></math>', kind: 'text', rt: { tag: 'style', ns: 'math' } },
  { id: 'math/script', body: '<math><script>{p.x}</script></math>', kind: 'text', rt: { tag: 'script', ns: 'math' } },
  { id: 'svg/fo/script', body: '<svg><foreignObject><script>{p.x}</script></foreignObject></svg>', kind: 'text', rt: { tag: 'script', expect: ESCAPED_SCRIPT } },
  { id: 'svg/fo/style', body: '<svg><foreignObject><style>{p.x}</style></foreignObject></svg>', kind: 'text', rt: { tag: 'style', expect: ESCAPED_STYLE } },
  { id: 'svg/fo/svg/script', body: '<svg><foreignObject><svg><script>{p.x}</script></svg></foreignObject></svg>', kind: 'text', rt: { tag: 'script', ns: 'svg' } },
  { id: 'math/fo/script', body: '<math><foreignObject><script>{p.x}</script></foreignObject></math>', kind: 'text', rt: { tag: 'script', ns: 'math' } },
  { id: 'math/svg/fo/script', body: '<math><svg><foreignObject><script>{p.x}</script></foreignObject></svg></math>', kind: 'text', rt: { tag: 'script', ns: 'math' } },
  // Tag-name case: the parser lowercases `<SVG>`, so it IS foreign content.
  { id: 'case/SVG-script', body: "h('SVG', null, h('script', null, p.x))", kind: 'text', rt: { tag: 'script', ns: 'svg' } },
  { id: 'case/Math-style', body: "h('Math', null, h('style', null, p.x))", kind: 'text', rt: { tag: 'style', ns: 'math' } },
  { id: 'case/math-FOREIGNOBJECT', body: "h('math', null, h('FOREIGNOBJECT', null, h('script', null, p.x)))", kind: 'text', rt: { tag: 'script', ns: 'math' } },
  // A VNode reaching a compiled `_ssr` CHILD HOLE under baked foreign content.
  ...(['script', 'style'] as const).flatMap((vtag): Ctx[] => [
    { id: `hole/svg-sole/${vtag}`, body: '<svg>{p.v}</svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'svg' } },
    { id: `hole/svg-mixed/${vtag}`, body: '<svg><g></g>{p.v}<g></g></svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'svg' } },
    { id: `hole/svg-g/${vtag}`, body: '<svg><g>{p.v}</g></svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'svg' } },
    { id: `hole/math/${vtag}`, body: '<math>{p.v}</math>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'math' } },
    { id: `hole/math-fo/${vtag}`, body: '<math><foreignObject>{p.v}</foreignObject></math>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'math' } },
    { id: `hole/svg-fo/${vtag}`, body: '<svg><foreignObject>{p.v}</foreignObject></svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, expect: vtag === 'script' ? ESCAPED_SCRIPT : ESCAPED_STYLE } },
    { id: `hole/svg-fo-svg/${vtag}`, body: '<svg><foreignObject><svg>{p.v}</svg></foreignObject></svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'svg' } },
    { id: `hole/svg-map/${vtag}`, body: '<svg>{p.list.map((v) => <g>{v}</g>)}</svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'svg' } },
    { id: `hole/svg-for/${vtag}`, body: '<svg><For each={p.rows} by={(r) => r.k}>{(r) => <g>{r.v}</g>}</For></svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'svg' } },
    { id: `hole/svg-cond/${vtag}`, body: '<svg>{p.on && <g>{p.v}</g>}</svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'svg' } },
    { id: `hole/svg-component/${vtag}`, body: '<svg><Wrap v={p.v} /></svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'svg' } },
    { id: `hole/svg-component-children/${vtag}`, body: '<svg><g><Pass>{p.v}</Pass></g></svg>', kind: 'vnode', vtag, tpl: true, rt: { tag: vtag, ns: 'svg' } },
    // Inside a raw-text / RCDATA ANCESTOR, whose text ends at the ancestor's
    // own end tag (`<noscript>` is raw text with scripting on, parse5's default).
    ...['noscript', 'textarea', 'title', 'iframe', 'noembed', 'noframes', 'xmp'].map(
      (anc): Ctx => ({ id: `rawancestor/${anc}/${vtag}`, body: `<${anc}>{p.v}</${anc}>`, kind: 'vnode', vtag }),
    ),
  ]),
  { id: 'rawancestor/noscript-literal', body: '<noscript><script>{p.x}</script><style>{p.x}</style></noscript>', kind: 'text' },
  // Two sinks in one document: a comment opened in one element must not be
  // closable from another.
  { id: 'cross/svg-style+json-script', body: '<div><svg><style>{p.x}</style></svg><script type="application/json">{p.x}</script></div>', kind: 'text' },
  { id: 'cross/svg-script+style', body: '<div><svg><script>{p.x}</script></svg><style>{p.x}</style></div>', kind: 'text' },
  // Comments and hydration markers.
  { id: 'marker/for-element-rows', body: '<ul><For each={p.items} by={(r) => r.k}>{(r) => <li>{r.t}</li>}</For></ul>', kind: 'key' },
  { id: 'marker/for-fragment-rows', body: '<ul><For each={p.items} by={(r) => r.k}>{(r) => <><li>{r.t}</li><li></li></>}</For></ul>', kind: 'key' },
  { id: 'marker/for-text-rows', body: '<ul><For each={p.items} by={(r) => r.k}>{(r) => r.t}</For></ul>', kind: 'key' },
  { id: 'marker/suspense', body: '<div><Suspense fallback={<i title={p.x}>{p.x}</i>}><Slow x={p.x} /></Suspense></div>', kind: 'text' },
]

const PRELUDE = `import { For, Suspense, h } from '@pyreon/core'
const Wrap = (q) => <g>{q.v}</g>
const Pass = (q) => q.children
const Slow = async (q) => {
  await new Promise((r) => setTimeout(r, 1))
  return <b title={q.x}>{q.x}</b>
}
export const App = (p) => `

function propsFor(ctx: Ctx, x: string, neutral: boolean): Record<string, unknown> {
  switch (ctx.kind) {
    case 'text':
    case 'url':
      return { x }
    case 'name':
      return { o: neutral ? { 'data-n': 'v' } : { [x]: 'v' } }
    case 'styleKey':
      return { o: neutral ? { color: 'red' } : { [x]: 'red' } }
    case 'urlObj':
      return { o: { [ctx.key!]: x } }
    case 'vnode': {
      const v = h(ctx.vtag!, null, x)
      return { v, list: [v], rows: [{ k: 'r', v }], on: true }
    }
    case 'key':
      return { items: neutral ? [{ k: 'n1', t: 'a' }, { k: 'n2', t: 'b' }] : [{ k: x, t: 'a' }, { k: `${x}\u0001`, t: 'b' }] }
  }
}

function payloadsFor(kind: Kind): readonly string[] {
  if (kind === 'url' || kind === 'urlObj') return URL_PAYLOADS
  if (kind === 'name' || kind === 'styleKey') return NAME_PAYLOADS
  return TEXT_PAYLOADS
}

// ─── Oracle ──────────────────────────────────────────────────────────────────

interface P5Node {
  nodeName: string
  tagName?: string
  namespaceURI?: string
  attrs?: { name: string; value: string; prefix?: string }[]
  childNodes?: P5Node[]
  content?: P5Node
  value?: string
  data?: string
}

const NS: Record<string, string> = {
  'http://www.w3.org/1999/xhtml': 'html',
  'http://www.w3.org/2000/svg': 'svg',
  'http://www.w3.org/1998/Math/MathML': 'math',
}

function bodyOf(html: string): P5Node {
  const doc = parse(`<!DOCTYPE html><html><head></head><body>${html}</body></html>`) as unknown as P5Node
  const htmlEl = doc.childNodes!.find((n) => n.nodeName === 'html')!
  return htmlEl.childNodes!.find((n) => n.nodeName === 'body')!
}

function kids(n: P5Node): P5Node[] {
  return n.nodeName === 'template' && n.content ? n.content.childNodes ?? [] : n.childNodes ?? []
}

const attrName = (a: { name: string; prefix?: string }): string => (a.prefix ? `${a.prefix}:${a.name}` : a.name)

function skeleton(n: P5Node): string {
  let s = ''
  for (const c of kids(n)) {
    if (c.nodeName === '#comment') s += '#c'
    else if (c.tagName) s += `<${NS[c.namespaceURI!] ?? '?'}:${c.tagName}>${skeleton(c)}</>`
  }
  return s
}

function elements(n: P5Node, out: P5Node[] = []): P5Node[] {
  for (const c of kids(n)) {
    if (c.tagName) {
      out.push(c)
      elements(c, out)
    }
  }
  return out
}

function directText(n: P5Node): string {
  return kids(n)
    .filter((c) => c.nodeName === '#text')
    .map((c) => c.value)
    .join('')
}

const URL_ATTR_NAMES = new Set([...URL_ATTRS].map((a) => a.toLowerCase()))
const RASTER_DATA = /^data:image\/(?:png|jpe?g|gif|webp|avif)[;,]/i

/** The scheme the browser would act on, after the URL parser's own normalisation. */
function scriptScheme(tag: string, attr: string, value: string): string | null {
  let protocol: string
  try {
    protocol = new URL(value, 'https://base.example/').protocol
  } catch {
    return null // unparseable → the browser does not navigate/fetch it
  }
  if (protocol === 'javascript:' || protocol === 'vbscript:') return protocol
  if (protocol === 'data:') {
    const imageSrc = ['img', 'source', 'video'].includes(tag) && (attr === 'src' || attr === 'poster')
    // oxlint-disable-next-line no-control-regex
    const v = value.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+/, '')
    if (imageSrc && RASTER_DATA.test(v)) return null
    return protocol
  }
  return null
}

function normalizeInput(s: string, nul: 'drop' | 'replace'): string {
  const lf = s.replace(/\r\n?/g, '\n')
  return lf.split('\u0000').join(nul === 'drop' ? '' : '\uFFFD')
}

function check(ctx: Ctx, x: string, html: string, neutralHtml: string): string | null {
  const body = bodyOf(html)
  const nbody = bodyOf(neutralHtml)
  const sk = skeleton(body)
  const nsk = skeleton(nbody)
  if (sk !== nsk) return `skeleton differs from neutral render\n    got  ${sk}\n    want ${nsk}`

  const els = elements(body)
  const nels = elements(nbody)
  for (let i = 0; i < els.length; i++) {
    const el = els[i]!
    const tag = el.tagName!
    const names = el.attrs!.map(attrName)
    const neutralNames = new Set(nels[i]!.attrs!.map(attrName))
    for (const a of el.attrs!) {
      const name = attrName(a)
      if (EVENT_HANDLER_ATTRS.has(a.name.toLowerCase())) return `event-handler attribute ${name} on <${tag}>`
      if (URL_ATTR_NAMES.has(name.toLowerCase()) || a.name.toLowerCase() === 'href') {
        const scheme = scriptScheme(tag, a.name.toLowerCase(), a.value)
        if (scheme) return `${name}=${JSON.stringify(a.value)} on <${tag}> resolves to a ${scheme} URL`
      }
    }
    const extra = names.filter((n) => !neutralNames.has(n))
    if (ctx.kind === 'name') {
      // The spread key may become exactly ONE attribute carrying its own value.
      const own = el.attrs!.filter((a) => !neutralNames.has(attrName(a)))
      if (own.length > 1 || (own.length === 1 && own[0]!.value !== 'v'))
        return `spread key produced attributes ${JSON.stringify(own)} on <${tag}>`
    } else if (extra.length > 0 && ctx.kind !== 'styleKey') {
      return `attributes the author did not write on <${tag}>: ${extra.join(', ')}`
    }
  }

  if (ctx.kind === 'key') {
    const keys = new Set([x, `${x}\u0001`])
    const walk = (n: P5Node): string | null => {
      for (const c of kids(n)) {
        if (c.nodeName === '#comment') {
          const d = c.data!
          const enc = d.startsWith('k:') ? [d.slice(2)] : d.startsWith('/pyreon-for:') ? d.slice(12).split(' ') : []
          for (const e of enc) {
            let k: string
            try {
              k = decodeKeyFromMarker(e)
            } catch {
              return `marker ${JSON.stringify(d)} does not decode`
            }
            if (!keys.has(k)) return `marker ${JSON.stringify(d)} decodes to ${JSON.stringify(k)}, not a row key`
          }
        } else if (c.tagName) {
          const r = walk(c)
          if (r) return r
        }
      }
      return null
    }
    const r = walk(body)
    if (r) return r
  }

  const rt = ctx.rt
  if (rt && !(rt.leadingLf && x.startsWith('\n'))) {
    const el = els.find((e) => e.tagName === rt.tag && NS[e.namespaceURI!] === (rt.ns ?? 'html'))
    if (!el) return `round-trip: no <${rt.ns ?? 'html'}:${rt.tag}> in output`
    const got = rt.attr !== undefined ? el.attrs!.find((a) => a.name === rt.attr)?.value : directText(el)
    const want = normalizeInput((rt.expect ?? ((s: string) => s))(x), rt.nul ?? 'replace')
    // An empty `style` is omitted, not written as `style=""` (by design).
    if (rt.attr === 'style' && x === '' && got === undefined) return null
    if (got !== want) return `round-trip: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`
  }
  return null
}

// ─── The matrix ──────────────────────────────────────────────────────────────

const PATHS = [
  ['h', 'string'],
  ['h', 'stream'],
  ['js', 'string'],
  ['js', 'stream'],
  ['rs', 'string'],
  ['rs', 'stream'],
] as const

for (const [backend, api] of PATHS) {
  const describeBackend = backend === 'rs' && !nativeTransform ? describe.skip : describe
  describeBackend(`SSR escaping matrix — ${backend} backend, renderTo${api === 'string' ? 'String' : 'Stream'}`, () => {
    for (const ctx of CONTEXTS) {
      it(ctx.id, async () => {
        const code = compile(PRELUDE + ctx.body, backend)
        if (backend !== 'h' && ctx.tpl) {
          expect(code, `${ctx.id}: the template backend must emit _ssr for this context`).toMatch(/\b_ssr\(/)
        }
        const App = load(code)
        const render = async (props: Record<string, unknown>): Promise<string> => {
          const vnode = h(App as core.ComponentFn, props)
          return api === 'string' ? renderToString(vnode) : collect(renderToStream(vnode))
        }
        const neutralHtml = await render(propsFor(ctx, 'n', true))
        const failures: string[] = []
        for (const x of payloadsFor(ctx.kind)) {
          const html = await render(propsFor(ctx, x, false))
          const err = check(ctx, x, html, neutralHtml)
          if (err) failures.push(`payload ${JSON.stringify(x)}: ${err}\n    html ${JSON.stringify(html.slice(0, 400))}`)
        }
        expect(failures.slice(0, 4).join('\n'), `${failures.length} failing payload(s)`).toBe('')
      })
    }
  })
}

describe('SSR escaping matrix — size', () => {
  it('covers every context on every path with the full payload sets', () => {
    // A shrinking matrix is a weakening gate; keep these floors honest.
    expect(CONTEXTS.length).toBeGreaterThanOrEqual(100)
    expect(TEXT_PAYLOADS.length).toBeGreaterThanOrEqual(80)
    expect(URL_PAYLOADS.length).toBeGreaterThanOrEqual(60)
    expect(NAME_PAYLOADS.length).toBeGreaterThanOrEqual(50)
  })
})
