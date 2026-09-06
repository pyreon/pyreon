/**
 * Two emit invariants the compiled-path hydration parity fuzz found broken
 * (`runtime-dom/src/tests/hydration-parity-fuzz-compiled.test.tsx`).
 *
 * 1. A DYNAMIC children expression in a template slot is wrapped in an accessor
 *    exactly as the h()/SSR emit wraps it (`shouldWrap`), so the client carries
 *    the same number of reactive levels as the server markup. Passing
 *    `props.children` BARE handed `_mountSlot` the CHILD's own accessor as the
 *    slot's accessor: the SSR markup was `<!--$--><!--$-->x<!--/$--><!--/$-->`
 *    (two levels) and the client had one, so hydration adopted the outer range,
 *    mis-walked the inner one and mounted the child's text a second time.
 *    A static local stays bare on both sides.
 *
 * 2. Every phase-2 line names its PARENT by a phase-1 const. `elementHasDynamic`
 *    looked at an element's DIRECT children only, so an expression wrapped in a
 *    fragment — `<b><i/><>{x}</></b>` — flattened to a placeholder child of `<b>`
 *    at emit time without `<b>` ever getting a const; its walk was inlined into
 *    the phase-2 `_setChildAt(__p0.nextSibling, …)` and evaluated AFTER `__p0`
 *    had been replaced: `null.replaceChild`, a client-mount crash.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX } from '../index'

const phase2Lines = (code: string) =>
  code.split('\n').filter((l) => /^\s+(_setChildAt|_mountSlot|_textSlot|_mountChild|const __d\d+ = _mountSlot)\(/.test(l) || /= _(mountSlot|textSlot|mountChild)\(/.test(l))

describe('children slot — accessor levels match the SSR emit', () => {
  it('wraps a props-derived children expression in an accessor', () => {
    const { code } = transformJSX(
      `const Comp = (props) => <div class="comp">{() => props.label()}{props.children}</div>`,
      'x.tsx',
    )
    expect(code).toContain('_mountSlot(() => (props.children), __root, __p1)')
    expect(code).not.toContain('_mountSlot(props.children,')
  })

  it('keeps a static local children binding bare', () => {
    const { code } = transformJSX(
      `const Loc = (props) => { let children = props.children; return <div class="c">{"a"}{children}</div> }`,
      'x.tsx',
    )
    expect(code).toContain('_mountSlot(children, __root, __p1)')
  })
})

describe('phase-2 parents are phase-1 consts — fragments included', () => {
  const PARENT = /^(__root|__[ep]\d+)$/
  const parentsOf = (code: string) => {
    const out: string[] = []
    for (const m of code.matchAll(/_setChildAt\(([^,]+),/g)) out.push(m[1]!.trim())
    for (const m of code.matchAll(/_mountSlot\([^;]*?,\s*([^,]+),\s*__p\d+\)/g)) out.push(m[1]!.trim())
    for (const m of code.matchAll(/_textSlot\(([^,]+),/g)) out.push(m[1]!.trim())
    return out
  }

  it('the fuzz seed-10 shape: two fragment-wrapped texts, the second under a nested element', () => {
    const { code } = transformJSX(
      `const App = () => <main><p><>{""}</><b class="c1"><i class="c4">{"témû"}</i><>{"témû"}</></b></p>{"hello"}</main>`,
      'x.tsx',
    )
    const parents = parentsOf(code)
    expect(parents.length).toBeGreaterThanOrEqual(3)
    for (const p of parents) expect(p, code).toMatch(PARENT)
    // the `<b>` holds a const of its own now, so its slot line names it
    expect(code).toMatch(/_setChildAt\(__e\d+, __p\d+, "témû"\)/)
  })

  it('a fragment-wrapped expression counts as dynamic for the parent element', () => {
    const { code } = transformJSX(`const App = () => <main><p>{"x"}<b><>{"t"}</></b></main>`, 'x.tsx')
    for (const p of parentsOf(code)) expect(p, code).toMatch(PARENT)
  })

  it('an element with only baked static text still needs no const (no emit churn)', () => {
    const { code } = transformJSX(`const App = () => <main><b>t</b><i>{() => x()}</i></main>`, 'x.tsx')
    // `<b>` bakes its text into the HTML and has no phase-2 line, so no const.
    expect(code).toContain('<b>t</b>')
    expect(code).not.toMatch(/const __e\d+ = __root\.firstChild;/)
  })
})
