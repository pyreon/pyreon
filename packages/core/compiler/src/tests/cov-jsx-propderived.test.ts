/**
 * Branch coverage — `jsx.ts` PROP-DERIVED const inlining and its lexical
 * shadow set.
 *
 * `const cls = props.cls` is inlined at every JSX use site so the read stays
 * live. That substitution is only sound while the name still REFERS to that
 * const, so every binding form that can re-bind the name has to switch it off.
 * Each spec asserts the substituted text, so a shadow rule that stops firing
 * emits `props.cls` where the source said something else.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const t = (src: string) => transformJSX_JS(src, 'in.tsx').code
/** A component whose `cls` const is prop-derived, plus an extra body stmt. */
const P = (body: string) => `function A(props) {
  const cls = props.cls
${body}
}`
/** Did the OUTER `<div class={cls}>` get the prop read inlined? */
const inlinedOuter = (body: string) => t(P(`${body}\n  return <div class={cls}>x</div>`))

describe('jsx.ts — the baseline inlining', () => {
  it('inlines a prop-derived const at its JSX use site', () => {
    const src = P('  return <div class={cls}>x</div>')
    const js = transformJSX_JS(src, 'in.tsx').code
    expect(transformJSX(src, 'in.tsx').code).toBe(js)
    expect(js).toContain('_setClass(__root, (props.cls))')
    expect(js).not.toContain('_setClass(__root, cls)')
  })

  it('inlines TRANSITIVELY through a second derived const', () => {
    const out = t('function A(props) { const a = props.x; const b = a + 1; return <div class={b}>x</div> }')
    expect(out).toContain('((props.x) + 1)')
  })

  it('a const NOT derived from props is left alone', () => {
    const out = t('function A(props) { const cls = "k"; return <div class={cls}>x</div> }')
    expect(out).toContain('_setClass(__root, cls)')
    expect(out).not.toContain('props.cls')
  })
})

describe('jsx.ts — BLOCK-level re-bindings shadow the whole block', () => {
  it('an OBJECT-PATTERN re-binding (via rest) shadows it', () => {
    const out = inlinedOuter('  const { a, ...cls } = o;')
    expect(out).toContain('_setClass(__root, cls)')
    expect(out).not.toContain('_setClass(__root, (props.cls))')
  })

  it('an OBJECT-PATTERN re-binding by plain key shadows it', () => {
    const out = inlinedOuter('  const { cls } = o;')
    expect(out).toContain('_setClass(__root, cls)')
    expect(out).not.toContain('_setClass(__root, (props.cls))')
  })

  it('a RENAMED object-pattern re-binding shadows the LOCAL name', () => {
    const out = inlinedOuter('  const { a: cls } = o;')
    expect(out).toContain('_setClass(__root, cls)')
    expect(out).not.toContain('_setClass(__root, (props.cls))')
  })

  it('an ARRAY-PATTERN re-binding shadows it', () => {
    const out = inlinedOuter('  const [cls] = o;')
    expect(out).toContain('_setClass(__root, cls)')
  })

  it('an array pattern with a DEFAULT still binds the name', () => {
    const out = inlinedOuter('  const [cls = 1] = o;')
    expect(out).toContain('_setClass(__root, cls)')
    expect(out).not.toContain('_setClass(__root, (props.cls))')
  })

  it('a FUNCTION DECLARATION of the same name shadows it', () => {
    const out = inlinedOuter('  function cls() {}')
    expect(out).toContain('_setClass(__root, cls)')
  })

  it('a CLASS DECLARATION of the same name shadows it', () => {
    const out = inlinedOuter('  class cls {}')
    expect(out).toContain('_setClass(__root, cls)')
  })

  it('a declaration of a DIFFERENT name does not shadow it', () => {
    const out = inlinedOuter('  const other = 1;')
    expect(out).toContain('props.cls')
  })
})

describe('jsx.ts — scoped re-bindings shadow only their OWN subtree', () => {
  /** The inner JSX keeps the bare name; the outer one still inlines. */
  const bothWays = (body: string) => {
    const out = inlinedOuter(body)
    expect(out).toContain('_setClass(__root, (props.cls))')
    return out
  }

  it('a CATCH parameter shadows inside the handler only', () => {
    const out = bothWays('  try {} catch (cls) { g(<i class={cls}/>) }')
    expect(out).toContain('<i class={() => cls}/>')
  })

  it('a `for (let cls …)` head shadows inside the loop only', () => {
    const out = bothWays('  for (let cls = 0;;) { g(<i class={cls}/>) }')
    expect(out).toContain('<i class={() => cls}/>')
  })

  it('a `for…of` head shadows inside the loop only', () => {
    const out = bothWays('  for (const cls of xs) { g(<i class={cls}/>) }')
    expect(out).toContain('<i class={() => cls}/>')
  })

  it('a `for…in` head shadows inside the loop only', () => {
    const out = bothWays('  for (const cls in xs) { g(<i class={cls}/>) }')
    expect(out).toContain('<i class={() => cls}/>')
  })

  it('a `for (;;)` with NO declaration in the head does not shadow', () => {
    const out = inlinedOuter('  for (;;) { g(<i class={cls}/>) }')
    expect(out).toContain('<i class={() => (props.cls)}/>')
  })

  it('an ARROW PARAMETER with a default shadows inside the arrow', () => {
    const out = t(P('  const f = (cls = 1) => <i class={cls}/>;\n  return <div>{f()}</div>'))
    expect(out).toContain('<i class={cls}/>')
    expect(out).not.toContain('<i class={(props.cls)}/>')
  })

  it('a REST parameter shadows inside the arrow', () => {
    const out = t(P('  const f = (...cls) => <i class={cls}/>;\n  return <div>{f()}</div>'))
    expect(out).toContain('<i class={cls}/>')
  })

  it('a NESTED object-pattern parameter shadows inside the arrow', () => {
    const out = t(P('  const f = ({ a: { cls } }) => <i class={cls}/>;\n  return <div>{f()}</div>'))
    expect(out).toContain('<i class={cls}/>')
    expect(out).not.toContain('<i class={(props.cls)}/>')
  })
})

describe('jsx.ts — non-reference identifier positions are never substituted', () => {
  it('a MEMBER PROPERTY of the same name is left alone', () => {
    const out = t(P('  return <div class={o.cls}>x</div>'))
    expect(out).toContain('_setClass(__root, o.cls)')
    expect(out).not.toContain('o.(props.cls)')
  })

  it('a COMPUTED member read IS substituted (it is a real reference)', () => {
    const out = t(P('  return <div class={o[cls]}>x</div>'))
    expect(out).toContain('o[(props.cls)]')
  })

  it('an object-literal KEY of the same name is left alone', () => {
    const out = t(P('  return <div style={{ cls: 1 }}>x</div>'))
    expect(out).toContain('{ cls: 1 }')
    expect(out).not.toContain('{ (props.cls): 1 }')
  })

  it('a SHORTHAND object property expands to `key: value` rather than losing the key', () => {
    const out = t(P('  return <div style={{ cls }}>x</div>'))
    expect(out).toContain('{ cls: (props.cls) }')
  })
})

describe('jsx.ts — a circular prop-derived chain warns and keeps the captured value', () => {
  it('warns once with the cycle chain and does not recurse forever', () => {
    const r = transformJSX_JS(
      'function A(props) { const a = b + props.x; const b = a + 1; return <div class={a} id={b}>x</div> }',
      'in.tsx',
    )
    const cyc = r.warnings.filter((w) => w.code === 'circular-prop-derived')
    expect(cyc.length).toBe(1)
    expect(cyc[0]!.message).toContain('Circular prop-derived const reference')
    expect(r.code).toContain('_setClass')
  })

  it('a NON-circular chain warns about nothing', () => {
    const r = transformJSX_JS(
      'function A(props) { const a = props.x; const b = a + 1; return <div class={b}>x</div> }',
      'in.tsx',
    )
    expect(r.warnings.filter((w) => w.code === 'circular-prop-derived')).toHaveLength(0)
  })
})

describe('jsx.ts — which functions register a props param', () => {
  it('a component function registers its first param', () => {
    expect(t('function A(props) { return <div>{props.a}</div> }')).toContain('_bindProp(props')
  })

  it('a JSX-CHILD render callback does NOT (`row` is a runtime item, not props)', () => {
    const out = t('function A(props) { return <For each={xs}>{(row) => <td>{row.id}</td>}</For> }')
    expect(out).toContain('_setChild(__root, row.id)')
    expect(out).not.toContain('_bindProp(row')
  })

  it('a render callback under a FRAGMENT parent is skipped the same way', () => {
    const out = t('function A(props) { return <><For each={xs}>{(row) => <td>{row.id}</td>}</For></> }')
    expect(out).toContain('_setChild(__root, row.id)')
  })

  it('a `.map()` CALLBACK argument does NOT register props either', () => {
    const out = t('function A(props) { return <div>{xs.map((row) => <td>{row.id}</td>)}</div> }')
    expect(out).not.toContain('_bindProp(row')
  })

  it('an ATTRIBUTE-VALUE render function DOES register (it can be a real inline component)', () => {
    const out = t('function A(props) { return <Comp component={(p) => <td>{p.id}</td>} /> }')
    expect(out).toContain('p.id')
  })

  it('a ZERO-parameter function registers nothing', () => {
    const out = t('function A() { return <div>{props.a}</div> }')
    expect(out).not.toContain('_bindProp(props')
  })

  it('a function containing NO JSX registers nothing', () => {
    const out = t('function A(props) { return props.a }\nexport const B = () => <div>{props.a}</div>')
    expect(out).not.toContain('_bindProp(props')
  })

  it('a NON-identifier first parameter registers nothing', () => {
    const out = t('function A({ a }) { return <div>{a}</div> }')
    expect(out).not.toContain('_bindProp')
  })
})
