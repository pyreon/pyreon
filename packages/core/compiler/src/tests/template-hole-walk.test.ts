/**
 * Template holes are WALKED, not sliced.
 *
 * An expression child of a client-templated element that builds JSX
 * (`{items.map((x) => <li/>)}`, `{cond() ? <a/> : <b/>}`, `{() => …}`) used to
 * be sliced into the `_tpl` bind as raw source text. The walk never visited a
 * slice, so every element inside it fell to `jsx()` at runtime — 347 of the 616
 * element `jsx()` calls the example corpus compiled to. It is now a PRESERVED
 * hole, walked in place like an absorbed component child, so its elements
 * compile like any other JSX the walk reaches (templates, `_rp` props, signal
 * auto-call, prop-derived inlining). The SSR emit walks the same expression
 * (`clientWalksHole` is the one predicate both share), so the server brackets
 * the nested templates' placeholders exactly as the client expects.
 *
 * Not walked, deliberately: a hole whose element sits in SVG or MathML content
 * (`inForeignContent`). Each element a walked hole builds is a template ROOT,
 * namespaced by its own tag alone — `<svg>{on && <a/>}</svg>` would build an
 * HTML `<a>`.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'
import { collectTsx, templateBailCensus } from './_template-bail-census'

/** `(code, filename, ssr, knownSignals, lens, collapse, ssrTemplate, templatizeComponentChildren)` */
type NativeArgs = [string, string, boolean, string[] | null, boolean?, undefined?, boolean?, boolean?]
type NativeTransform = (...args: NativeArgs) => { code: string; mapMappings?: string | null }

let nativeTransform: NativeTransform | null = null

try {
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  nativeTransform = (
    requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as { transformJsx: NativeTransform }
  ).transformJsx
} catch {
  // Native binary not built: the JS assertions still run.
}

const client = (src: string, tcc = true) =>
  transformJSX_JS(src, 'hole.tsx', { templatizeComponentChildren: tcc }).code

const ssrH = (src: string) => transformJSX_JS(src, 'hole.tsx', { ssr: true }).code
const ssrT = (src: string) => transformJSX_JS(src, 'hole.tsx', { ssr: true, ssrTemplate: true }).code

/** Lowercase JSX elements left in compiled output — each is a runtime `jsx('tag')`. */
function domJsxLeft(code: string): string[] {
  const left: string[] = []
  // oxlint-disable-next-line typescript/no-explicit-any -- untyped ESTree walk
  const visit = (n: any): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const c of n) visit(c)
      return
    }
    if (n.type === 'JSXElement') {
      const name = n.openingElement.name
      if (name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name)) left.push(name.name)
    }
    for (const k of Object.keys(n)) if (n[k] && typeof n[k] === 'object') visit(n[k])
  }
  visit(parseSync('out.tsx', code, { sourceType: 'module', lang: 'tsx' }).program)

  return left
}

const SIG = 'import { signal } from "@pyreon/reactivity"\n'

/** Hole shapes whose every element must compile. */
const WALKED: Array<[name: string, src: string]> = [
  ['map', 'const A = (p) => <ul>{p.xs.map((x) => <li class="r">{x.name}<b>{x.n}</b></li>)}</ul>'],
  ['map over a signal', `${SIG}const A = () => { const xs = signal([1]); return <ul>{xs().map((x) => <li>{x}</li>)}</ul> }`],
  ['optional-chained map', `${SIG}const A = () => { const xs = signal([1]); return <ul>{xs()?.map((x) => <li>{x}</li>)}</ul> }`],
  ['block-bodied map', 'const A = (p) => <ul>{p.xs.map((x) => { const y = x * 2; return <li>{y}</li> })}</ul>'],
  ['nested map', 'const A = (p) => <table>{p.rows.map((r) => <tr>{r.cells.map((c) => <td>{c}</td>)}</tr>)}</table>'],
  ['ternary', `${SIG}const A = () => { const on = signal(true); return <div>{on() ? <b>yes</b> : <i>no</i>}<s /></div> }`],
  ['logical and', `${SIG}const A = () => { const on = signal(true); return <div><s />{on() && <b>yes</b>}</div> }`],
  ['static ternary', 'const A = (p) => <div>{FLAG ? <b>{p.v}</b> : null}</div>'],
  ['explicit accessor', `${SIG}const A = () => { const on = signal(true); return <div>{() => on() && <b>x</b>}</div> }`],
  ['type-wrapped JSX', 'const A = () => <div><b />{(<span>t</span>) as never}</div>'],
  ['map with handler and ref', 'const A = (p) => <ul>{p.xs.map((x) => <li ref={p.r} onClick={() => p.pick(x)}>{x}</li>)}</ul>'],
  ['map item with a component', 'const A = (p) => <ul>{p.xs.map((x) => <li><b>{x}</b><Row v={x} /></li>)}</ul>'],
  ['helper call taking JSX', 'function cell(n) { return <td>{n}</td> }\nconst A = (p) => <tr>{cell(<b>{p.v}</b>)}</tr>'],
  ['foreignObject returns to HTML', 'const A = (p) => <svg><foreignObject><div>{p.on && <p><b />{p.v}</p>}</div></foreignObject></svg>'],
]

/** Hole shapes that deliberately stay slices, and why. */
const SLICED: Array<[name: string, src: string]> = [
  ['svg content: the arm would be an HTML <a>', 'const A = (p) => <svg>{p.on && <a href={p.u}>x</a>}</svg>'],
  ['svg-only ancestor (a component-rooted <g>)', 'const A = (p) => <g>{p.on ? <title>t</title> : null}</g>'],
  ['math content', 'const A = (p) => <math><mrow>{p.on && <mi>x</mi>}</mrow></math>'],
]

describe('template holes are walked', () => {
  for (const [name, src] of WALKED) {
    it(`${name}: no element is left to jsx()`, () => {
      const out = client(src)
      expect(out, out).toContain('_tpl(')
      expect(domJsxLeft(out), out).toEqual([])
    })
  }

  for (const [name, src] of SLICED) {
    it(`${name}: the hole stays a slice on the client and the server`, () => {
      const out = client(src)
      expect(domJsxLeft(out).length, out).toBeGreaterThan(0)
      // The server mirrors it: nothing in the hole is entered as a template.
      expect(ssrH(src)).not.toContain('_slot(')
    })
  }

  it('a keyed item root stays on h() — its children still compile', () => {
    const out = client('const A = (p) => <ul>{p.xs.map((x) => <li key={x.id}><b>{x.n}</b></li>)}</ul>')
    expect(domJsxLeft(out)).toEqual(['li'])
    expect(out).toContain('_tpl("<b></b>"')
  })

  it('a signal read in a walked item binds its own effect; the item param is never auto-called', () => {
    const out = client(`${SIG}const A = () => { const sel = signal(1); const x = signal(0); return <ul>{[1].map((x) => <li class={sel() === x ? 'on' : ''}>{x}</li>)}</ul> }`)
    expect(out).toContain('_setClass(__root, sel() === x ? \'on\' : \'\')')
    expect(out).toContain('_setChild(__root, x)')
    expect(out).not.toContain('x()')
  })

  it('a prop-derived alias inlines in the walked item; a parameter of the same name wins', () => {
    const inlined = client('function C(props) { const cls = props.theme; return <ul>{props.xs.map((i) => <li class={cls}>{i}</li>)}</ul> }')
    expect(inlined).toContain('_setClass(__root, (props.theme))')
    const shadowed = client('function C(props) { const a = props.x; return <ul>{props.xs.map((a) => <li>{a}</li>)}</ul> }')
    expect(shadowed).toContain('_setChild(__root, a)')
    expect(shadowed).not.toContain('(props.x)')
  })

  it('a component in a walked hole gets reactive props', () => {
    const out = client(`${SIG}const A = () => { const s = signal(1); return <ul>{[1].map((i) => <li><Row v={s()} /></li>)}</ul> }`)
    expect(out).toContain('_rpd(s)')
  })

  it('the SSR emit brackets the nested template\'s placeholder on both paths', () => {
    const src = 'const A = () => <ul><b />{xs.map((x) => <li><b />{x}<i /></li>)}</ul>'
    expect(ssrH(src)).toContain('{() => (xs.map((x) => <li><b />{_slot(x)}<i /></li>))}')
    expect(ssrT(src)).toContain('_ssrChildren(xs.map((x) => {')
    expect(ssrT(src)).toContain('"<li><b></b><!--$-->" + _h0 + "<!--/$--><i></i></li>"')
  })

  it('a `.map` item parameter shadowing a signal is not auto-called by the `_ssr` item builders', () => {
    // Pre-existing in both `_ssr` fast paths: the item holes were sliced without
    // the callback's parameters in scope, so `x` became `x()` — a server crash
    // (`x is not a function`) for a number item.
    const map = ssrT(`${SIG}function C() { const x = signal(0); return <ul>{[1].map((x) => <li>{x}</li>)}</ul> }`)
    expect(map).toContain('_escSole(x)')
    expect(map).not.toContain('x()')
    const forRow = ssrT(`${SIG}function C() { const x = signal(0); return <ul><For each={[1]} by={(x) => x}>{(x) => <li>{x}</li>}</For></ul> }`)
    expect(forRow).toContain('_escSole(x)')
    expect(forRow).not.toContain('x()')
    const alias = ssrT('function C(props) { const a = props.x; return <ul>{props.items.map((a) => <li>{a}</li>)}</ul> }')
    expect(alias).toContain('_escSole(a)')
    expect(alias).not.toContain('(props.x)')
  })
})

describe.runIf(nativeTransform !== null)('template holes: the native backend is byte-identical', () => {
  const MODES = [
    { ssr: false, ssrTemplate: false, tcc: false },
    { ssr: false, ssrTemplate: false, tcc: true },
    { ssr: true, ssrTemplate: false, tcc: false },
    { ssr: true, ssrTemplate: true, tcc: false },
    { ssr: true, ssrTemplate: true, tcc: true },
  ]
  const EXTRA: Array<[string, string]> = [
    // An optional call's callback param is a value, not props (the native walk
    // skipped the callback flags for `?.(…)`, so `r.label` was wrapped).
    ['optional-chained keyed map', `${SIG}const A = () => { const rows = signal([]); return <ul>{rows()?.map((r) => <li key={r.id}>{r.label}</li>)}</ul> }`],
    ['For row with a walked map', 'const A = (p) => <ul><For each={p.rows} by={(r) => r.id}>{(r) => <li><b>{r.name.split(" ").map((w) => <i>{w}</i>)}</b></li>}</For></ul>'],
    ['residual component arm under foreignObject', 'const A = (p) => <svg><foreignObject><div>{p.on ? <b>x</b> : <Comp />}<i /></div></foreignObject></svg>'],
  ]
  for (const [name, src] of [...WALKED, ...SLICED, ...EXTRA]) {
    it(name, () => {
      for (const m of MODES) {
        const js = transformJSX_JS(src, 'hole.tsx', {
          ssr: m.ssr,
          ssrTemplate: m.ssrTemplate,
          templatizeComponentChildren: m.tcc,
        })
        const rs = nativeTransform!(src, 'hole.tsx', m.ssr, null, false, undefined, m.ssrTemplate, m.tcc)
        expect(rs.code, JSON.stringify(m)).toBe(js.code)
        expect(rs.mapMappings ?? undefined, JSON.stringify(m)).toBe(js.map?.mappings)
      }
    })
  }

  it('an optional-chained map item param is not wrapped as a props read', () => {
    const src = EXTRA[0]![1]
    const rs = nativeTransform!(src, 'hole.tsx', false, null, false, undefined, false, true).code
    expect(rs).toContain('{r.label}')
    expect(rs).not.toContain('() => r.label')
  })
})

/**
 * The coverage this walk bought, as a ratchet over the real example corpus
 * (compiled the way `@pyreon/vite-plugin` does). Before the walk: 616 element
 * `jsx()` calls left, 347 of them inside template binds. Lower the ceilings when
 * a later change compiles more; raise one only with a reason recorded here —
 * new example code that bails for a reason the census names is such a reason.
 * `bun packages/core/compiler/scripts/template-bail-census.ts` prints the buckets.
 */
describe('template-bail census over examples/', () => {
  const REPO = join(process.cwd(), '..', '..', '..')
  const files = collectTsx(join(REPO, 'examples'))
  const r = templateBailCensus(files, (code, file) =>
    transformJSX(code, file, { templatizeComponentChildren: true }).code,
  )

  it('compiles the corpus', () => {
    expect(r.compiled).toBeGreaterThan(400)
  })

  it('elements left inside template binds stay at or below the walked level', () => {
    // 78: keyed `.map` item roots (21), self-closing roots, and the children of
    // roots that bail for those reasons. None of them is unvisited.
    expect(r.buckets['in-template'] ?? 0).toBeLessThanOrEqual(78)
  })

  it('element jsx() calls in total stay at or below the walked level', () => {
    // 349 = 347 + 2 from the e2e fixture `examples/fixtures/pwa-offline/src/routes/index.tsx`
    // (#4722): its `<main>` root has component children (`<Show>`, `<For>`) that are not in a
    // trailing run (`root:other`), and one child element of that `h()` root (`child-of-h`).
    expect(r.total).toBeLessThanOrEqual(349)
  })
})
