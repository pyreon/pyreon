/**
 * Branch coverage — `jsx.ts` SCOPE tracking: which bare identifiers the emitter
 * treats as signals, as JSX-returning helpers, as JSX collections, or as
 * props-backed reads — and every shadowing form that must switch them off.
 *
 * Each spec asserts the EMIT, so a shadowing rule that stops firing shows up as
 * the wrong runtime helper rather than as an unchanged coverage number.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const t = (src: string) => transformJSX_JS(src, 'in.tsx').code
const bothAgree = (src: string) => {
  const js = transformJSX_JS(src, 'in.tsx').code
  expect(transformJSX(src, 'in.tsx').code).toBe(js)
  return js
}
const SIG = 'const count = signal(0)\n'
const CELL = 'const cell = (v) => <b>{v}</b>\n'

describe('jsx.ts — signal shadowing by every parameter form', () => {
  it('a bare module-scope signal read is AUTO-CALLED', () => {
    const out = bothAgree(`${SIG}export const A = () => <div>{count}</div>`)
    expect(out).toContain('count()')
  })

  it('an IDENTIFIER parameter of the same name shadows it', () => {
    const out = t(`${SIG}function A(count) { return <div>{count}</div> }`)
    expect(out).toContain('_setChild(__root, count)')
    expect(out).not.toContain('count()')
  })

  it('an OBJECT-PATTERN parameter shadows it', () => {
    const out = t(`${SIG}function A({ count }) { return <div>{count}</div> }`)
    expect(out).toContain('_setChild(__root, count)')
    expect(out).not.toContain('count()')
  })

  it('a RENAMED object-pattern parameter shadows the LOCAL name', () => {
    const out = t(`${SIG}function A({ n: count }) { return <div>{count}</div> }`)
    expect(out).not.toContain('count()')
  })

  it('an ARRAY-PATTERN parameter shadows it', () => {
    const out = t(`${SIG}function A([count]) { return <div>{count}</div> }`)
    expect(out).toContain('_setChild(__root, count)')
    expect(out).not.toContain('count()')
  })

  it('a DIFFERENTLY-named parameter does NOT shadow it', () => {
    const out = t(`${SIG}function A({ other }) { return <div>{count}</div> }`)
    expect(out).toContain('count()')
  })
})

describe('jsx.ts — signal shadowing by a body-level declaration', () => {
  it('`let count = 1` in the body shadows the module signal', () => {
    const out = t(`${SIG}function A() { let count = 1; return <div>{count}</div> }`)
    expect(out).toContain('_setChild(__root, count)')
    expect(out).not.toContain('count()')
  })

  it('`let count` with NO initializer shadows it too', () => {
    const out = t(`${SIG}function A() { let count; return <div>{count}</div> }`)
    expect(out).not.toContain('count()')
  })

  it('a re-declaration that is ITSELF a `signal()` call is NOT a shadow', () => {
    const out = t(`${SIG}function A() { const count = signal(5); return <div>{count}</div> }`)
    expect(out).toContain('count()')
  })

  it('a body-level DESTRUCTURING re-declaration IS a shadow (every binding form is)', () => {
    // `findShadowingNames` used to scan body declarations for `decl.id.type ===
    // "Identifier"` only, so an object/array pattern re-binding a signal name
    // kept the auto-call — `const { count } = p` then `{count}` emitted
    // `count()`, a `TypeError` on whatever `p.count` held. Every binding form a
    // function introduces now shadows: patterns at any depth, `catch (e)`,
    // `for (const x of …)` heads, block-nested `let`, function/class
    // declarations (see `collectFunctionBindings`).
    const out = t(`${SIG}function A() { const { count } = p; return <div>{count}</div> }`)
    expect(out).not.toContain('count()')
    // The parameter form of the same destructure shadows too.
    expect(t(`${SIG}function A({ count }) { return <div>{count}</div> }`)).not.toContain('count()')
  })
})

describe('jsx.ts — a signal CALLED WITH ARGUMENTS is a write, not a bare read', () => {
  it('`sig(1)` in a component prop keeps the generic `_rp` wrap', () => {
    const out = t(`${SIG}export const A = () => <Comp v={count(1)} />`)
    expect(out).toContain('_rp(() => count(1))')
    expect(out).not.toContain('_rpd(')
  })

  it('`sig()` in the same position takes the DIRECT-tier `_rpd` wrap', () => {
    const out = t(`${SIG}export const A = () => <Comp v={count()} />`)
    expect(out).toContain('_rpd(count)')
  })
})

describe('jsx.ts — in-file JSX-returning helper calls mount instead of stringifying', () => {
  it('a CONCISE-arrow helper call routes through `_mountSlot`', () => {
    const out = bothAgree(`${CELL}export const A = () => <div>{cell(1)}</div>`)
    expect(out).toContain('_mountSlot(() => (cell(1))')
    expect(out).not.toContain('bindPolymorphicText')
  })

  it('a helper whose JSX is the ALTERNATE of a ternary also counts', () => {
    const src = 'const cell = (v) => v ? null : <b>x</b>\nexport const A = () => <div>{cell(1)}</div>'
    expect(t(src)).toContain('_mountSlot')
  })

  it('a helper whose JSX is the RIGHT side of `&&` also counts', () => {
    const src = 'const cell = (v) => v && <b>x</b>\nexport const A = () => <div>{cell(1)}</div>'
    expect(t(src)).toContain('_mountSlot')
  })

  it('a BLOCK-bodied function declaration returning JSX counts', () => {
    const src =
      'function cell(v) { if (v) { return <b/> } return null }\nexport const A = () => <div>{cell(1)}</div>'
    expect(t(src)).toContain('_mountSlot')
  })

  it('a helper whose ONLY JSX return is inside a NESTED closure does NOT count', () => {
    const src =
      'const cell = (v) => { const g = () => <i/>; return 1 }\nexport const A = () => <div>{cell(1)}</div>'
    const out = t(src)
    expect(out).toContain('bindPolymorphicText')
    expect(out).not.toContain('_mountSlot')
  })

  it('a helper returning a non-JSX value does NOT count', () => {
    const src = 'const cell = (v) => v + 1\nexport const A = () => <div>{cell(1)}</div>'
    expect(t(src)).not.toContain('_mountSlot')
  })
})

describe('jsx.ts — JSX-helper shadowing by every binding form', () => {
  const shadowed = (decl: string) =>
    t(`${CELL}function A(${decl.includes('(') ? '' : decl}) { ${decl.includes('(') ? decl : ''} return <div>{cell(1)}</div> }`)

  it('an IDENTIFIER parameter shadows the helper', () => {
    const out = t(`${CELL}function A(cell) { return <div>{cell(1)}</div> }`)
    expect(out).toContain('bindPolymorphicText')
    expect(out).not.toContain('_mountSlot(() => (cell(1))')
  })

  it('an OBJECT-PATTERN parameter shadows it', () => {
    expect(shadowed('{ cell }')).toContain('bindPolymorphicText')
  })

  it('an ARRAY-PATTERN parameter shadows it', () => {
    expect(shadowed('[cell]')).toContain('bindPolymorphicText')
  })

  it('a body `let cell = 1` shadows it', () => {
    const out = t(`${CELL}function A() { let cell = 1; return <div>{cell(1)}</div> }`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('a body `let cell` with NO initializer shadows it', () => {
    const out = t(`${CELL}function A() { let cell; return <div>{cell(1)}</div> }`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('a body re-declaration that is ITSELF a JSX-returning fn is NOT a shadow', () => {
    const out = t(`${CELL}function A() { const cell = (v) => <i>{v}</i>; return <div>{cell(1)}</div> }`)
    expect(out).toContain('_mountSlot')
  })

  it('a DIFFERENTLY-named binding does not shadow it', () => {
    const out = t(`${CELL}function A(other) { return <div>{cell(1)}</div> }`)
    expect(out).toContain('_mountSlot')
  })
})

describe('jsx.ts — JSX COLLECTION bindings mount element-by-element', () => {
  it('an ARRAY literal holding JSX mounts rather than stringifying', () => {
    const out = bothAgree('const arr = [<a/>, <b/>]\nexport const A = () => <div>{arr}</div>')
    expect(out).toContain('_mountSlot(arr,')
    expect(out).not.toContain('_setChild(__root, arr)')
  })

  it('an array holding NO JSX keeps the plain child set', () => {
    const out = t('const arr = [1, 2]\nexport const A = () => <div>{arr}</div>')
    expect(out).toContain('_setChild(__root, arr)')
  })

  it('an array whose only entry is a SPREAD keeps the plain child set', () => {
    const out = t('const arr = [...xs]\nexport const A = () => <div>{arr}</div>')
    expect(out).toContain('_setChild(__root, arr)')
  })

  it('a `.map()` with an ARROW callback returning JSX mounts', () => {
    const out = t('const rows = items.map((i) => <li/>)\nexport const A = () => <div>{rows}</div>')
    expect(out).toContain('_mountSlot(rows,')
  })

  it('a `.map()` with a FUNCTION-EXPRESSION callback returning JSX mounts', () => {
    const out = t(
      'const rows = items.map(function (i) { return <li/> })\nexport const A = () => <div>{rows}</div>',
    )
    expect(out).toContain('_mountSlot(rows,')
  })

  it('a `.map()` whose callback returns NO JSX keeps the plain child set', () => {
    const out = t('const rows = items.map((i) => i)\nexport const A = () => <div>{rows}</div>')
    expect(out).toContain('_setChild(__root, rows)')
  })

  it('a `.map()` whose last argument is not a function keeps the plain child set', () => {
    const out = t('const rows = items.map(fn)\nexport const A = () => <div>{rows}</div>')
    expect(out).toContain('_setChild(__root, rows)')
  })

  it('a NON-`map` method call keeps the plain child set', () => {
    const out = t('const rows = items.filter((i) => <li/>)\nexport const A = () => <div>{rows}</div>')
    expect(out).toContain('_setChild(__root, rows)')
  })

  it('a binding with NO initializer keeps the plain child set', () => {
    const out = t('let arr;\nexport const A = () => <div>{arr}</div>')
    expect(out).toContain('_setChild(__root, arr)')
  })

  it('a PARENTHESIZED array initializer is still recognised', () => {
    const out = t('const arr = ([<a/>])\nexport const A = () => <div>{arr}</div>')
    expect(out).toContain('_mountSlot(arr,')
  })
})

describe('jsx.ts — `splitProps` results are tracked as props holders', () => {
  it('a `splitProps` local read binds by DESCRIPTOR (`_bindProp`)', () => {
    const out = t(
      'function A(props) { const [local, rest] = splitProps(props, ["a"]); return <div>{local.a}</div> }',
    )
    expect(out).toContain('_bindProp(local, "a"')
  })

  it('a NON-splitProps destructure of the same shape does not', () => {
    const out = t(
      'function A(props) { const [local, rest] = other(props, ["a"]); return <div>{local.a}</div> }',
    )
    expect(out).not.toContain('_bindProp(local')
  })

  it('the props PARAM itself binds by descriptor', () => {
    const out = t('function A(props) { return <div>{props.a}</div> }')
    expect(out).toContain('_bindProp(props, "a"')
  })

  it('a COMPUTED props read does not take the descriptor path', () => {
    const out = t('function A(props) { return <div>{props[k]}</div> }')
    expect(out).not.toContain('_bindProp(props')
  })

  it('a DEEP props chain does not take the descriptor path', () => {
    const out = t('function A(props) { return <div>{props.a.b}</div> }')
    expect(out).not.toContain('_bindProp(props')
  })
})
