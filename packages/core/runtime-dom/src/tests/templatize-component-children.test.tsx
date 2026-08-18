/**
 * Regression lock — `templatizeComponentChildren` (compiler opt-in).
 *
 * The template emitter bails on a COMPONENT child, so an app's whole
 * composition skeleton lowers to `h()` + `mountElement`. With the option on,
 * the skeleton bakes into the template HTML and each component child is mounted
 * into the clone (`_mountChild` append when nothing static follows it,
 * `_mountSlot` + a `<!>` placeholder otherwise).
 *
 * The load-bearing property is ORDERING. `_tpl(html, bind)` runs `bind` when the
 * CALL EXPRESSION evaluates, so a bind that MOUNTS COMPONENTS is ordered against
 * the enclosing component's setup. #2914 built this emit without that guard and
 * `<Provider>{_tpl(…)}</Provider>` mounted the whole subtree before `provide()`
 * — `ui-showcase-regression` went 26/26 → 4/26 while every synthetic suite in
 * the repo stayed green. Two things make it safe here:
 *
 *  1. A component's SOLE child is `_lc`-wrapped (#2916), so the template call is
 *     deferred to the component's own `props.children` read — after `provide()`.
 *  2. Every OTHER eager-argument position (multi-child component parent, member/
 *     namespaced tag parent, fragment, expression container) BAILS to `h()`.
 *
 * Every spec compiles REAL JSX through `transformJSX` — the actual emit, not a
 * hand-written approximation of it — and mounts it.
 *
 * Bisect (both directions recorded in the PR):
 *  - Neutering the ordering gate (`templateMountIsEagerlyOrdered` → false) makes
 *    the multi-child + member-tag context specs render `DEFAULT`.
 *  - Neutering the PZ-08 arm in `elementHasDynamic` corrupts the two-slot
 *    sibling order.
 */
import { transformSync } from 'esbuild'
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, _lc, createReactiveContext, h, provide, useContext } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setClass,
  _setStyle,
  _tpl,
  hydrateRoot,
  mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _mountChild,
  _lc,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  signal,
  provide,
  useContext,
  createReactiveContext,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const ON = { templatizeComponentChildren: true } as const

const stripImports = (c: string) => c.replace(/^import[^\n]*\n/gm, '')
/** The Pyreon transform leaves COMPONENT JSX for the app's downstream jsx pass
 * — lower it to h() so `new Function` can evaluate it. */
const lowerResidualJsx = (c: string) =>
  transformSync(c, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' })
    .code

function build(source: string, opts: Record<string, unknown>): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', opts)
  const body = lowerResidualJsx(stripImports(code).replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, `${body}\nreturn App`)(...DEP_VALUES) as () => unknown
}

function render(source: string, opts: Record<string, unknown>): string {
  const host = document.createElement('div')
  document.body.appendChild(host)
  mount(h(build(source, opts) as never, null), host)
  return host.innerHTML
}

const emit = (source: string) => transformJSX(source, 'test.tsx', ON).code

afterEach(() => {
  document.body.innerHTML = ''
})

// A provider whose child reads the context it provides. This is the shape that
// took #2914 from 26/26 to 4/26 — and no synthetic fixture in the repo had it.
const CTX = `
const Ctx = createReactiveContext('DEFAULT')
const Leaf = () => { const v = useContext(Ctx); return <span class="leaf">{() => v()}</span> }
const Provider = (props) => { provide(Ctx, () => 'PROVIDED'); return props.children }
`

describe('templatizeComponentChildren — emit shape', () => {
  it('absorbs an all-component child list as APPENDS, with no placeholder comments', () => {
    const code = emit(`const App = () => <div class="branch"><Node /><Node /></div>`)
    expect(code).toContain('_tpl("<div class=\\"branch\\"></div>"')
    expect(code).toContain('_mountChild(<Node />, __root, null)')
    // The placeholder variant of this feature measured 4.26ms against the
    // append variant's 3.93ms — 2,046 comment nodes cloned and then removed.
    expect(code).not.toContain('<!>')
    expect(code).not.toContain('_mountSlot')
  })

  it('uses a placeholder when static content FOLLOWS the component child', () => {
    const code = emit(`const App = () => <div class="c"><Comp /><span>S</span></div>`)
    expect(code).toContain('<!>')
    expect(code).toContain('_mountSlot')
  })

  it('bakes a static skeleton around a nested component child', () => {
    const code = emit(`const App = () => <div class="app"><main class="m"><Mid /></main></div>`)
    expect(code).toContain('_tpl("<div class=\\"app\\"><main class=\\"m\\"></main></div>"')
    // PZ-08: the parent ref must be a phase-1 const, not an inlined walk.
    expect(code).toContain('const __e0 = __root.firstElementChild')
    expect(code).toContain('_mountChild(<Mid />, __e0, null)')
  })

  // The absorbed child's source range is PRESERVED as a hole and walked, rather
  // than sliced. Slicing compiles, renders, and passes every structural check —
  // it just silently drops the transformations below, so a signal-driven prop
  // freezes. Nothing in this repo's unit suites caught that; 6 of 26
  // `ui-showcase-regression` specs did. These are the locks for it.
  it('PRESERVES _rp wrapping on an absorbed component child’s props', () => {
    const src = `const N = (props) => <div class="branch"><Node depth={props.depth - 1} /></div>`
    const code = transformJSX(src, 'test.tsx', ON).code
    expect(code).toContain('_tpl("<div class=\\"branch\\"></div>"')
    // Without the hole this reads `<Node depth={props.depth - 1} />` — a value
    // captured once, so the prop never updates again.
    expect(code).toContain('_mountChild(<Node depth={_rp(() => props.depth - 1)} />')
  })

  it('PRESERVES a signal auto-call on an absorbed component child’s props', () => {
    const src = `const s = signal(0)\nconst N = () => <div class="b"><Node v={s()} /></div>`
    expect(transformJSX(src, 'test.tsx', ON).code).toContain('v={_rp(() => s())}')
  })

  it('PRESERVES nested _tpl + _lc INSIDE an absorbed component child', () => {
    const src = `const N = () => <div class="a"><Card><b>x</b></Card></div>`
    const code = transformJSX(src, 'test.tsx', ON).code
    expect(code).toContain('_mountChild(<Card>{_lc(() => _tpl("<b>x</b>", () => null))}</Card>')
  })

  it('leaves the emit untouched when the option is OFF', () => {
    const src = `const App = () => <div class="branch"><Node /><Node /></div>`
    expect(transformJSX(src, 'test.tsx', {}).code).not.toContain('_tpl')
  })
})

describe('templatizeComponentChildren — ordering gate (the #2914 blocker)', () => {
  it("a provider's SOLE child is _lc-deferred, so it sees the provided context", () => {
    const src = `${CTX}\nconst App = () => <Provider><div class="k"><Leaf /></div></Provider>`
    expect(emit(src)).toContain('_lc(() => _tpl(')
    expect(render(src, ON)).toBe(render(src, {}))
    expect(render(src, ON)).toContain('PROVIDED')
  })

  it('BAILS on a multi-child component parent (props.children is an eager array)', () => {
    const src = `${CTX}\nconst App = () => <Provider><div class="k"><Leaf /></div><i /></Provider>`
    // Assert the USER-VISIBLE symptom first: with the gate neutered the
    // template call is an eager argument of `jsx(Provider, …)`, so the bind
    // mounts <Leaf/> before `provide()` and it reads the DEFAULT.
    expect(render(src, ON)).toContain('PROVIDED')
    expect(render(src, ON)).toBe(render(src, {}))
    // Not templatized at all — this is today's h() behaviour, unchanged.
    expect(emit(src)).not.toContain('_tpl("<div class=\\"k\\">')
  })

  it('BAILS on a member/namespaced tag parent (never _lc-wrapped)', () => {
    // `jsxTagName` reports '' for `<Ctx.Provider>`, which the uppercase test
    // would read as "not a component" — the gate must not be fooled.
    const src = `const App = () => <Ns.Provider><div class="k"><Leaf /></div></Ns.Provider>`
    expect(emit(src)).not.toContain('_tpl("<div class=\\"k\\">')
  })

  it('BAILS inside an expression container and a fragment child position', () => {
    expect(emit(`const App = () => <Provider>{<div class="k"><Leaf /></div>}</Provider>`)).not
      .toContain('_tpl("<div class=\\"k\\">')
    expect(emit(`const App = () => <Provider><><div class="k"><Leaf /></div></></Provider>`)).not
      .toContain('_tpl("<div class=\\"k\\">')
  })

  it('BAILS when the component sits inside NESTED fragments in an eager position', () => {
    // The gate's absorb-detection has to mirror `flattenChildren`'s fragment
    // recursion at any depth. A one-level scan reported "absorbs nothing" here
    // while the emit absorbed it anyway — gate skipped for a shape needing it.
    const src = `${CTX}\nconst App = () => <Provider><div class="k"><><><Leaf /></></></div><i /></Provider>`
    expect(render(src, ON)).toContain('PROVIDED')
    expect(emit(src)).not.toContain('_tpl("<div class=\\"k\\">')
  })

  it('a purely STATIC template is unaffected by the gate everywhere', () => {
    // Only a bind that MOUNTS is ordered against a component's setup, so a
    // static template still emits in a multi-child (eager) component position.
    // (Self-closing roots never templatize — that predates this option.)
    const code = emit(
      `const App = () => <Provider><div class="k"><b>x</b></div><div class="j"><b>y</b></div></Provider>`,
    )
    expect(code).toContain('_tpl("<div class=\\"k\\"><b>x</b></div>"')
  })
})

describe('templatizeComponentChildren — the hydration cost, pinned', () => {
  // This is the reason the option is DEFAULT OFF, recorded as an executable
  // measurement rather than a claim. A `_tpl` result is SWAPPED at hydration
  // ("there is no true `_tpl` hydration mode yet" — hydrate.ts), so every
  // element this option newly templatizes stops adopting its SSR DOM, and so
  // does everything below it. Flipping the default requires compiled-template
  // hydration adoption for the general case; until then this spec fails the
  // moment someone flips it, with the number attached.
  const LAYOUT = `
const Leaf = () => <span class="t">leaf</span>
const Mid = () => <section class="mid"><Leaf /></section>
const App = () => <div class="app"><main class="m"><Mid /></main></div>`

  function retention(opts: Record<string, unknown>): [number, number] {
    document.body.innerHTML =
      '<div id="root"><div class="app"><main class="m">' +
      '<section class="mid"><span class="t">leaf</span></section></main></div></div>'
    const root = document.getElementById('root') as HTMLElement
    const before = [...root.querySelectorAll('*')]
    hydrateRoot(root, h(build(LAYOUT, opts) as never, null))
    const after = [...root.querySelectorAll('*')]
    return [after.filter((n) => before.includes(n)).length, before.length]
  }

  it('OFF: the skeleton ADOPTS its SSR nodes', () => {
    // 4 of 4 since #2918 taught hydration to ADOPT compiled templates instead
    // of discarding them. This spec pinned 3/4 when it was written, because
    // back then `<span.t>` — a compiled template — swapped like every other
    // template did. That is the number the OFF arm must hold: if it ever
    // returns to 3/4, component-root adoption has regressed.
    expect(retention({})).toEqual([4, 4])
  })

  it('ON: the skeleton is templatized, so NOTHING below it is adopted', () => {
    expect(retention(ON)).toEqual([0, 4])
  })

  it('ON: the rendered result is still correct — this is a cost, not a bug', () => {
    retention(ON)
    expect((document.getElementById('root') as HTMLElement).innerHTML).toBe(
      '<div class="app"><main class="m"><section class="mid">' +
        '<span class="t">leaf</span></section></main></div>',
    )
  })
})

describe('templatizeComponentChildren — rendered DOM is identical to h()', () => {
  const LEAF = `const Leaf = () => <b>L</b>`
  const cases: [string, string][] = [
    ['all-component children', `<div class="c"><Leaf /><Leaf /></div>`],
    ['trailing component', `<div class="c"><h2>T</h2><Leaf /></div>`],
    ['component between statics', `<div class="c"><h2>T</h2><Leaf /><em>E</em></div>`],
    ['two components split by a static', `<div class="a"><Leaf /><span>S</span><Leaf /></div>`],
    ['nested skeleton', `<div class="a"><main class="m"><Leaf /></main><Leaf /></div>`],
    // PZ-08 behavioural locks. Neutering the phase-1-capture arm in
    // `elementHasDynamic` makes the first of these THROW
    // (`Cannot read properties of null (reading 'nextSibling')`) and the second
    // SILENTLY drop the component — `<section></section>` — because the
    // inlined ref walk runs after a preceding `_mountSlot` removed its `<!>`.
    ['slot before a nested-component element', `<div class="a"><Leaf /><span>S</span><section><Leaf /></section></div>`],
    ['text + slot before a nested-component element', `<div class="a">t<Leaf /><section><Leaf /></section></div>`],
    ['component + reactive text', `<div class="a">{() => 'x'}<Leaf /></div>`],
    // Control-flow components are absorbed like any other — deliberately NOT
    // name-filtered (excluding them by name would paper over the shapes the
    // repo happens to gate and leave the general one). `<tbody><For/></tbody>`
    // is the shape #2914 called out, so it is pinned here.
    ['a <For> child (keyed reconciler under a baked skeleton)', `<table><tbody><For each={() => [1, 2, 3]} by={(n) => n}>{(n) => <tr><td>{() => String(n)}</td></tr>}</For></tbody></table>`],
    ['deep three-level', `<div class="a"><section><i><Leaf /></i></section><Leaf /></div>`],
  ]
  for (const [label, jsx] of cases) {
    it(label, () => {
      const src = `${LEAF}\nconst App = () => (${jsx})`
      expect(render(src, ON)).toBe(render(src, {}))
    })
  }
})
