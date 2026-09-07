/**
 * Emit locks for the reactive-prop DIRECT tier.
 *
 * `<Row value={sig()} />` used to lower to `_rp(() => sig())` — an opaque
 * thunk — and the row's `{props.value}` to `bindPolymorphicText(() => props.value)`,
 * a tracked effect whose teardown is a hashed `Set.delete`. The dispose-500
 * ablation ladder measured that wrapper at ~half the residual over Solid: with
 * the prop holding the signal itself the bind arm drops 30.6 → 10.7µs/500 rows.
 *
 * Now: a BARE signal/computed call wraps with `_rpd(sig)` — a branded thunk
 * carrying the signal's `.direct`/`._v` — and a prop read binds by DESCRIPTOR
 * (`_bindProp(props, "value", …)`), so the getter's direct tier is reachable.
 * Everything else keeps its emit: a non-bare expression stays `_rp(() => …)`,
 * a deeper chain stays `bindPolymorphicText`, and `_bindProp` itself falls
 * back to the tracked path for any getter without `.direct`.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX } from '../index'
import { transformJSX_JS } from '../jsx'

const js = (src: string) => transformJSX(src, 'x.tsx').code

describe('_rpd — bare signal call as a component prop', () => {
  it('wraps a bare signal call with _rpd and imports it', () => {
    const out = js(`const sig = signal(1); const App = () => <Row value={sig()} />`)
    expect(out).toContain('value={_rpd(sig)}')
    expect(out).toMatch(/import \{[^}]*_rpd[^}]*\} from "@pyreon\/core"/)
  })

  it('a computed counts as a signal source', () => {
    const out = js(`const c = computed(() => 1); const App = () => <Row value={c()} />`)
    expect(out).toContain('value={_rpd(c)}')
  })

  it('keeps _rp for anything that is not exactly a bare call', () => {
    const out = js(`const sig = signal(1); const App = () => <Row a={sig() + 1} b={String(sig())} c={sig(2)} />`)
    expect(out).toContain('a={_rp(() => sig() + 1)}')
    expect(out).toContain('b={_rp(() => String(sig()))}')
    expect(out).not.toContain('_rpd')
  })

  it('a shadowed name is not a signal', () => {
    const out = js(`const sig = signal(1); function App(){ const sig = () => 2; return <Row value={sig()} /> }`)
    expect(out).not.toContain('_rpd')
  })
})

describe('_bindProp — a prop read binds by descriptor', () => {
  it('sole text child', () => {
    const out = js(`function Row(props) { return <span>{props.value}</span> }`)
    expect(out).toContain('_bindProp(props, "value", __t0, __root)')
    expect(out).toMatch(/import \{[^}]*_bindProp[^}]*\} from "@pyreon\/runtime-dom"/)
  })

  it('accessor form and mixed-content position', () => {
    expect(js(`function Row(props) { return <span>{() => props.value}</span> }`)).toContain('_bindProp(props, "value", __t0, __root)')
    // Mixed-content position — an element sibling keeps it mixed (a text-only
    // `x{props.value}` run fuses into one accessor and binds polymorphically).
    expect(js(`function Row(props) { return <span>x{props.value}<i></i></span> }`)).toContain('_bindProp(props, "value", __t0, __root)')
  })

  it('a deeper chain or a computed key keeps the polymorphic path', () => {
    expect(js(`function Row(props) { return <span>{props.a.b}</span> }`)).toContain('bindPolymorphicText(() => (props.a.b)')
    // a computed key is not a descriptor-bindable read (here `k` is static, so it bakes via _setChild)
    expect(js(`function Row(props) { return <span>{props[k]}</span> }`)).not.toContain('_bindProp')
  })

  it('both backends agree byte for byte', () => {
    for (const src of [
      `const sig = signal(1); const App = () => <Row value={sig()} n={sig() + 1} />`,
      `function Row(props) { return <span class="r">x{props.value}</span> }`,
    ]) expect(transformJSX_JS(src, 'x.tsx').code).toBe(js(src))
  })
})
