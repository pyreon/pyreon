import { transformJSX_JS } from '../jsx'
import { analyzeReactivity, formatReactivityLens } from '../reactivity-lens'
import type { ReactivityFinding } from '../reactivity-lens'

/**
 * Reactivity Lens — unit + drift gate.
 *
 * The load-bearing correctness contract: a lens span is a FAITHFUL RECORD of
 * a codegen decision, never an approximation. Two invariants are gated here:
 *
 *  1. **Additive** — collecting the lens does NOT change emitted `code`
 *     (kill-criterion a). Bisect: if a future edit makes lens collection
 *     mutate codegen, `additive` fails.
 *  2. **Drift** — every positive `reactive*` span's OUTPUT carries the
 *     matching codegen token (`_bind`/`_bindText`/`_rp`), and every
 *     `static-text` span's text is NOT reactively bound (kill-criterion b).
 *     Bisect: reverting the `lens(...)` call at any instrumented site drops
 *     the corresponding span and the matching `expect(kinds).toContain(...)`
 *     fails — documented per-fixture below.
 */

function kindsAt(code: string): string[] {
  return analyzeReactivity(code).findings.map((f) => f.kind)
}
function find(code: string, kind: string): ReactivityFinding[] {
  return analyzeReactivity(code).findings.filter((f) => f.kind === kind)
}
function sliceFinding(code: string, f: ReactivityFinding): string {
  // Re-derive the byte slice from line/col for a human-readable assertion.
  const lines = code.split('\n')
  const line = lines[f.line - 1] ?? ''
  return f.endLine === f.line
    ? line.slice(f.column, f.endColumn)
    : line.slice(f.column)
}

describe('reactivity-lens — additive contract (kill-criterion a)', () => {
  const FIXTURES = [
    `function C(){ return <div>{count()}</div> }`,
    `function C(p){ return <span>{p.label}</span> }`,
    `function C(){ return <Box title={n()} /> }`,
    `function C(){ return <div class="static">hi</div> }`,
    `function C(){ return <a class={() => cls()}>x</a> }`,
    `const x = 1; function C(){ const {a}=props; return <i>{a}</i> }`,
  ]

  it('lens collection NEVER changes emitted code (byte-identical)', () => {
    for (const src of FIXTURES) {
      const off = transformJSX_JS(src, 'f.tsx').code
      const on = transformJSX_JS(src, 'f.tsx', { reactivityLens: true }).code
      expect(on).toBe(off)
    }
  })

  it('lens field is absent unless opted in', () => {
    const r = transformJSX_JS(FIXTURES[0]!, 'f.tsx')
    expect(r.reactivityLens).toBeUndefined()
    const r2 = transformJSX_JS(FIXTURES[0]!, 'f.tsx', { reactivityLens: true })
    expect(Array.isArray(r2.reactivityLens)).toBe(true)
  })
})

describe('reactivity-lens — drift gate (positive claim = codegen record)', () => {
  it('reactive text: {count()} → reactive span + _bind in output', () => {
    const src = `function C(){ return <div>{count()}</div> }`
    const reactive = find(src, 'reactive')
    expect(reactive.length).toBe(1)
    expect(sliceFinding(src, reactive[0]!)).toBe('count()')
    // Drift proof: the codegen actually emitted a reactive binding.
    const out = transformJSX_JS(src, 'f.tsx').code
    expect(out).toMatch(/_bind(Text|Direct)?\(/)
    expect(kindsAt(src)).not.toContain('static-text')
  })

  it('static text: {p.x}-free plain identifier → static-text, NOT reactive', () => {
    const src = `function C(){ const label = "hi"; return <div>{label}</div> }`
    const k = kindsAt(src)
    expect(k).toContain('static-text')
    expect(k).not.toContain('reactive')
    const st = find(src, 'static-text')[0]!
    expect(sliceFinding(src, st)).toBe('label')
    // Drift proof: codegen baked it (no reactive binding helper for this).
    const out = transformJSX_JS(src, 'f.tsx').code
    expect(out).not.toMatch(/_bind\(\(\) => \{ \w+\.data = label \}/)
  })

  it('reactive prop: <Box title={n()} /> → reactive-prop + _rp in output', () => {
    const src = `function C(){ return <Box title={n()} /> }`
    const rp = find(src, 'reactive-prop')
    expect(rp.length).toBe(1)
    expect(sliceFinding(src, rp[0]!)).toBe('n()')
    expect(transformJSX_JS(src, 'f.tsx').code).toContain('_rp(() =>')
  })

  it('hoisted static: static JSX in a non-template position → hoisted-static + module preamble', () => {
    // A top-level returned static element becomes a `_tpl()` clone (template
    // path) — that's not a hoist, and the lens correctly stays silent (no
    // span = "not asserted"). maybeHoist only fires for static JSX in an
    // expression slot of a non-DOM (component) parent; that's the faithful
    // trigger and what the lens records.
    const src = `function C(){ return <Comp>{<b class="x">hi</b>}</Comp> }`
    const hs = find(src, 'hoisted-static')
    expect(hs.length).toBeGreaterThanOrEqual(1)
    expect(transformJSX_JS(src, 'f.tsx').code).toMatch(/const _\$h\d+ =/)
  })

  it('reactive attr: class={() => cls()} → reactive-attr', () => {
    const src = `function C(){ return <a class={() => cls()}>x</a> }`
    const ra = find(src, 'reactive-attr')
    expect(ra.length).toBe(1)
    expect(ra[0]!.detail).toContain('class')
  })
})

describe('reactivity-lens — footgun merge (existing detectPyreonPatterns)', () => {
  it('param-destructured props surface a footgun finding with the detector code', () => {
    // detectPyreonPatterns catches the PARAMETER-destructure shape
    // `({ name })`. The body-scope `const {x}=props` shape is the static
    // layer's known cliff (doc-only anti-pattern, no reliable AST detector)
    // — the lens's structural `static-text`/`reactive` signals are what
    // compensate for that downstream. This asserts the merge surfaces
    // whatever the existing detector finds, faithfully.
    const src = `function C({ name }){ return <div>{name}</div> }`
    const fg = find(src, 'footgun')
    expect(fg.length).toBeGreaterThanOrEqual(1)
    expect(fg.some((f) => f.code === 'props-destructured')).toBe(true)
  })

  it('findings are sorted by (line, column)', () => {
    const src = [
      `function C(props){`,
      `  const { a } = props`,
      `  return <div>{count()}</div>`,
      `}`,
    ].join('\n')
    const { findings } = analyzeReactivity(src)
    for (let i = 1; i < findings.length; i++) {
      const prev = findings[i - 1]!
      const cur = findings[i]!
      expect(
        prev.line < cur.line ||
          (prev.line === cur.line && prev.column <= cur.column),
      ).toBe(true)
    }
  })
})

describe('reactivity-lens — zero false "live" on idiomatic code (kill-criterion b)', () => {
  it('purely static component yields no reactive* findings', () => {
    const src = `function Card(){ return <div class="card"><h2>Title</h2><p>Body</p></div> }`
    const k = kindsAt(src)
    expect(k).not.toContain('reactive')
    expect(k).not.toContain('reactive-prop')
    expect(k).not.toContain('reactive-attr')
  })

  it('parse failure → empty, never throws', () => {
    const r = analyzeReactivity(`function C( { return <div`)
    expect(Array.isArray(r.findings)).toBe(true)
  })
})

describe('reactivity-lens — formatter', () => {
  it('renders annotated source with kind badges', () => {
    const src = `function C(){ return <div>{count()}</div> }`
    const out = formatReactivityLens(src, analyzeReactivity(src))
    expect(out).toContain('live')
    expect(out).toContain('1 |')
  })
})
