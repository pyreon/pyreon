/**
 * `templatizeComponentChildren` — EMIT-level coverage.
 *
 * The behavioural half of this feature lives in
 * `runtime-dom/src/tests/templatize-component-children.test.tsx`, which mounts
 * the compiled output and is where the DOM-order, context-ordering and
 * hydration-cost locks are. This file is the compiler's own: it pins the EMIT —
 * which shapes absorb, which bail, and what survives into the emitted text.
 *
 * Both exist on purpose. Coverage is a property of a package's OWN sources plus
 * its OWN tests, so the runtime-dom suite — which exercises every one of these
 * branches — contributes nothing to `@pyreon/compiler`'s number. Without this
 * file the new branch set is dead weight in the coverage report even though it
 * is thoroughly tested one package over.
 *
 * NOTE these specs call `transformJSX`, which PREFERS the native binary — so
 * once the native mirror landed they assert the RUST emit, not the JS one. That
 * is deliberate and worth keeping: the JS branches are covered by the same
 * assertions running through `transformJSX_JS` in the equivalence oracle
 * (`native-equivalence.test.ts` compares the two backends byte-for-byte on this
 * option), so a divergence reds there while THIS file pins the shipped shape.
 * Before the mirror existed the option forced the JS backend, which is why this
 * header used to say the opposite.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX } from '../index'

const ON = { templatizeComponentChildren: true } as const
const emit = (src: string, opts: Record<string, unknown> = ON) =>
  transformJSX(src, 'test.tsx', opts).code

/** Does this source templatize the element carrying `cls`? */
const templatizes = (src: string, cls: string) => emit(src).includes(`_tpl("<div class=\\"${cls}\\"`)

const CTX = `const Leaf = () => <span class="leaf">x</span>\n`

describe('absorbing component children', () => {
  it('appends an all-component child list with no placeholder comment', () => {
    const code = emit(`const App = () => <div class="branch"><Node /><Node /></div>`)
    expect(code).toContain('_tpl("<div class=\\"branch\\" data-pyreon-hole></div>"')
    expect(code).toContain('_mountChild(<Node />, __root, null)')
    expect(code).not.toContain('_mountSlot')
    expect(code).not.toContain('<!>')
    // Both children mount, each with its own disposer.
    expect(code).toContain('__d0')
    expect(code).toContain('__d1')
  })

  it('imports _mountChild from runtime-dom only when it absorbs one', () => {
    expect(emit(`const App = () => <div class="a"><Node /></div>`)).toContain(
      'import { _tpl, _mountChild } from "@pyreon/runtime-dom"',
    )
    expect(emit(`const App = () => <div class="a"><b>x</b></div>`)).not.toContain('_mountChild')
  })

  it('BAILS to h() when static content FOLLOWS the component', () => {
    // A hole is marker-free only because it runs to the element's own closing
    // tag. Static content after a component would need a real extent marker, so
    // rather than emit a `<!>` placeholder — correct, but a template containing
    // a comment is refused by hydration's verifier, which cost this shape more
    // retention than the absorb bought — the element bails to `h()` exactly as
    // it does with the option off.
    const src = `const App = () => <div class="c"><Comp /><span>S</span></div>`
    const code = emit(src)
    expect(code).not.toContain('_mountSlot(<Comp />')
    expect(code).not.toContain('_mountChild')
    expect(code).not.toContain('data-pyreon-hole')
    // The definition of "bails": byte-identical to the option being off.
    expect(code).toBe(emit(src, {}))
  })

  it('appends when the component is LAST after static content, and declares a hole', () => {
    const code = emit(`const App = () => <div class="c"><h2>T</h2><Comp /></div>`)
    // The static sibling bakes; the component appends after it. The hole starts
    // where the template ends and runs to `</div>`, so it still needs no marker.
    expect(code).toContain('_tpl("<div class=\\"c\\" data-pyreon-hole><h2>T</h2></div>"')
    expect(code).toContain('_mountChild(<Comp />, __root, null)')
    expect(code).not.toContain('_mountSlot')
    expect(code).not.toContain('<!>')
  })

  it('BAILS when a component is interleaved between static children', () => {
    const src = `const App = () => <div class="c"><A /><span>S</span><B /></div>`
    expect(emit(src)).toBe(emit(src, {}))
  })

  it('BAILS when TEXT precedes the component (the prefix must be elements)', () => {
    // Text before the hole would have to align 1:1 with the server's, which is
    // the alignment the hole deliberately stops checking.
    const src = `const App = () => <div class="c">hi<Comp /></div>`
    expect(emit(src)).toBe(emit(src, {}))
  })

  it('bakes a static skeleton and mounts into a PHASE-1 ref (PZ-08)', () => {
    const code = emit(`const App = () => <div class="app"><main class="m"><Mid /></main></div>`)
    expect(code).toContain('_tpl("<div class=\\"app\\"><main class=\\"m\\" data-pyreon-hole></main></div>"')
    expect(code).toContain('const __e0 = __root.firstElementChild')
    expect(code).toContain('_mountChild(<Mid />, __e0, null)')
  })

  it('absorbs a member/namespaced-tag CHILD (never a DOM element)', () => {
    expect(emit(`const App = () => <div class="a"><Ns.Item /></div>`)).toContain(
      '_mountChild(<Ns.Item />, __root, null)',
    )
  })

  it('absorbs control-flow components — deliberately NOT name-filtered', () => {
    // Excluding <For>/<Show> by name would paper over the shapes the repo
    // happens to gate and leave the general one open.
    const code = emit(`const App = () => <div class="a"><For each={xs} by={k}>{r => <b/>}</For></div>`)
    expect(code).toContain('_tpl("<div class=\\"a\\" data-pyreon-hole></div>"')
    expect(code).toContain('_mountChild(<For')
  })

  it('absorbs a component nested inside fragments at any depth', () => {
    expect(templatizes(`const App = () => <div class="a"><><><Comp /></></></div>`, 'a')).toBe(true)
  })
})

describe('preserved holes — what survives into the emitted child', () => {
  // The absorbed child keeps its OWN source range and is walked in place. A
  // slice would emit the text as it stood BEFORE the walk, silently dropping
  // everything below — it compiles and renders, and only a real app catches it.
  it('keeps _rp wrapping on the child’s props', () => {
    const code = emit(`const N = (props) => <div class="b"><Node depth={props.depth - 1} /></div>`)
    expect(code).toContain('_mountChild(<Node depth={_rp(() => props.depth - 1)} />')
    expect(code).toContain('import { _rp } from "@pyreon/core"')
  })

  it('keeps the signal auto-call on the child’s props', () => {
    const code = emit(`const s = signal(0)\nconst N = () => <div class="b"><Node v={s()} /></div>`)
    expect(code).toContain('v={_rp(() => s())}')
  })

  it('keeps a nested _tpl + _lc INSIDE the absorbed child', () => {
    const code = emit(`const N = () => <div class="a"><Card><b>x</b></Card></div>`)
    expect(code).toContain('_mountChild(<Card>{_lc(() => _tpl("<b>x</b>", () => null))}</Card>')
  })

  it('walks EVERY hole when several are absorbed, in source order', () => {
    const code = emit(
      `const N = (props) => <div class="b"><A x={props.a} /><B y={props.b} /></div>`,
    )
    expect(code).toContain('_mountChild(<A x={_rp(() => props.a)} />, __root, null)')
    expect(code).toContain('_mountChild(<B y={_rp(() => props.b)} />, __root, null)')
    expect(code.indexOf('<A x=')).toBeLessThan(code.indexOf('<B y='))
  })

  it('walks a hole that follows a BAKED static sibling', () => {
    // The hole's own source range is walked wherever it sits in the child list,
    // not only when it is the first child — a slice would emit the child's text
    // as it stood before the walk and silently drop the `_rp` wrapping.
    const code = emit(`const N = (props) => <div class="b"><span>S</span><A x={props.a} /></div>`)
    expect(code).toContain('_mountChild(<A x={_rp(() => props.a)} />')
  })
})

describe('ordering gate — eager-argument positions BAIL to h()', () => {
  // A `_tpl` bind runs when the CALL EXPRESSION evaluates, so a bind that
  // MOUNTS components is ordered against the enclosing component's setup.
  it('sole child of a component is _lc-deferred, so it may templatize', () => {
    const code = emit(`${CTX}const App = () => <Provider><div class="k"><Leaf /></div></Provider>`)
    expect(code).toContain('_lc(() => _tpl("<div class=\\"k\\" data-pyreon-hole></div>"')
  })

  it('BAILS on a multi-child component parent', () => {
    expect(
      templatizes(`${CTX}const App = () => <P><div class="k"><Leaf /></div><i /></P>`, 'k'),
    ).toBe(false)
  })

  it('BAILS on a member/namespaced-tag PARENT', () => {
    // `jsxTagName` reports '' there, so an uppercase test alone would misread
    // `<Ctx.Provider>` as a DOM tag and wrongly allow the templatization.
    expect(
      templatizes(`${CTX}const App = () => <Ns.P><div class="k"><Leaf /></div></Ns.P>`, 'k'),
    ).toBe(false)
  })

  it('BAILS inside an expression container', () => {
    expect(
      templatizes(`${CTX}const App = () => <P>{<div class="k"><Leaf /></div>}</P>`, 'k'),
    ).toBe(false)
  })

  it('BAILS in a fragment child position', () => {
    expect(
      templatizes(`${CTX}const App = () => <P><><div class="k"><Leaf /></div></></P>`, 'k'),
    ).toBe(false)
  })

  it('BAILS when the component sits inside NESTED fragments in an eager position', () => {
    // The absorb-detection must mirror `flattenChildren`'s fragment recursion at
    // any depth; a one-level scan reported "absorbs nothing" and skipped the gate.
    expect(
      templatizes(
        `${CTX}const App = () => <P><div class="k"><><><Leaf /></></></div><i /></P>`,
        'k',
      ),
    ).toBe(false)
  })

  it('does NOT gate a template that absorbs nothing, even in an eager position', () => {
    // Only a bind that MOUNTS is ordered against a component's setup.
    const code = emit(
      `const App = () => <P><div class="k"><b>x</b></div><div class="j"><b>y</b></div></P>`,
    )
    expect(code).toContain('_tpl("<div class=\\"k\\"><b>x</b></div>"')
  })

  it('a template in RETURN position absorbs freely', () => {
    expect(templatizes(`const App = () => <div class="k"><Leaf /></div>`, 'k')).toBe(true)
  })
})

describe('scope of the option', () => {
  it('is a no-op when OFF — the element bails exactly as before', () => {
    const src = `const App = () => <div class="branch"><Node /><Node /></div>`
    expect(emit(src, {})).not.toContain('_tpl')
    expect(emit(src, { templatizeComponentChildren: false })).toBe(emit(src, {}))
  })

  it('is CLIENT-only — an SSR transform is unaffected', () => {
    const src = `const App = () => <div class="branch"><Node /><Node /></div>`
    expect(emit(src, { ssr: true, templatizeComponentChildren: true })).toBe(
      emit(src, { ssr: true }),
    )
  })

  it('does not change a self-closing root (never templatized, predates this)', () => {
    const src = `const App = () => <div class="k" />`
    expect(emit(src)).toBe(emit(src, {}))
  })

  it('leaves an element with only DOM children byte-identical to OFF', () => {
    const src = `const App = () => <div class="a"><b>x</b><i>y</i></div>`
    expect(emit(src)).toBe(emit(src, {}))
  })
})
