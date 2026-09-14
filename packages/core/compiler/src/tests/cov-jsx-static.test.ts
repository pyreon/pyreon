/**
 * Branch coverage — `jsx.ts` STATIC classification: which JSX subtrees hoist to
 * module scope, which expressions count as static (so an attribute needs no
 * tracked binding), and the component-CHILD carve-outs.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const t = (src: string) => transformJSX_JS(src, 'in.tsx').code
const bothAgree = (src: string) => {
  const js = transformJSX_JS(src, 'in.tsx').code
  expect(transformJSX(src, 'in.tsx').code).toBe(js)
  return js
}
const hoisted = (src: string) => /const _\$h\d+ =/.test(t(src))
const HOST = (inner: string) => `export const A = () => <div>{${inner}}</div>`

describe('jsx.ts — static JSX expression children hoist to module scope', () => {
  it('hoists a SELF-CLOSING element with only string attributes', () => {
    const out = bothAgree(HOST('<span id="a" />'))
    expect(out).toContain('const _$h0 = /*@__PURE__*/ <span id="a" />')
  })

  it('hoists a FRAGMENT whose children are all static', () => {
    expect(hoisted(HOST('<><span/>t</>'))).toBe(true)
  })

  it('hoists an element with a VALUELESS (boolean) attribute', () => {
    expect(hoisted(HOST('<span hidden>t</span>'))).toBe(true)
  })

  it('hoists an element with a NUMERIC-literal attribute expression', () => {
    expect(hoisted(HOST('<span id={1}>t</span>'))).toBe(true)
  })

  it('hoists an element with a NULL-literal attribute expression', () => {
    expect(hoisted(HOST('<span id={null}>t</span>'))).toBe(true)
  })

  it('hoists an element with a BOOLEAN-literal attribute expression', () => {
    expect(hoisted(HOST('<span id={true}>t</span>'))).toBe(true)
  })

  it('hoists an element with a no-substitution TEMPLATE-literal attribute', () => {
    expect(hoisted(HOST('<span id={`a`}>t</span>'))).toBe(true)
  })

  it('does NOT hoist a template literal WITH a substitution', () => {
    expect(hoisted(HOST('<span id={`a${x}`}>t</span>'))).toBe(false)
  })

  it('hoists an element with an EMPTY expression attribute', () => {
    expect(hoisted(HOST('<span id={/* c */}>t</span>'))).toBe(true)
  })

  it('hoists an element with a static EXPRESSION child', () => {
    expect(hoisted(HOST('<span>{1}</span>'))).toBe(true)
  })

  it('hoists an element with an EMPTY expression child', () => {
    expect(hoisted(HOST('<span>{/* c */}</span>'))).toBe(true)
  })

  it('does NOT hoist an element with a DYNAMIC attribute', () => {
    expect(hoisted(HOST('<span id={x}>t</span>'))).toBe(false)
  })

  it('does NOT hoist an element with a DYNAMIC expression child', () => {
    expect(hoisted(HOST('<span>{x}</span>'))).toBe(false)
  })

  it('does NOT hoist an element with a SPREAD attribute', () => {
    expect(hoisted(HOST('<span {...p}>t</span>'))).toBe(false)
  })

  it('does NOT hoist an element with a NESTED dynamic descendant', () => {
    expect(hoisted(HOST('<span><b id={x}>t</b></span>'))).toBe(false)
  })

  it('hoists an element with a NESTED fully-static descendant', () => {
    expect(hoisted(HOST('<span><b id="a">t</b></span>'))).toBe(true)
  })

  it('does NOT hoist a fragment carrying a dynamic child', () => {
    expect(hoisted(HOST('<><span id={x}/></>'))).toBe(false)
  })
})

describe('jsx.ts — pure-call attribute values need no tracked binding', () => {
  it('a PURE static call (`Math.max(1, 2)`) is applied once, not bound', () => {
    const out = t(HOST('<span id={Math.max(1, 2)}>t</span>'))
    expect(out).toContain('_setAttr(__root, "id", Math.max(1, 2))')
    expect(out).not.toContain('_bind(')
  })

  it('a pure call with a DYNAMIC argument is treated as dynamic', () => {
    const out = t(HOST('<span id={Math.max(1, x)}>t</span>'))
    expect(out).not.toContain('_setAttr(__root, "id", Math.max(1, x));\n  return null')
  })

  it('a pure call with a SPREAD argument is treated as dynamic', () => {
    expect(t(HOST('<span id={Math.max(...a)}>t</span>'))).not.toContain('_tpl(')
  })

  it('a NON-allowlisted call is treated as dynamic', () => {
    expect(t(HOST('<span id={foo(1)}>t</span>'))).not.toContain('_tpl(')
  })

  it('a pure COERCION call (`String(1)`) needs no tracked binding', () => {
    const out = t(HOST('<span id={String(1)}>t</span>'))
    expect(out).toContain('_setAttr(__root, "id", String(1))')
    expect(out).not.toContain('_bind(')
  })

  it('`Number(...)` and `Boolean(...)` behave the same', () => {
    expect(t(HOST('<span id={Number(1)}>t</span>'))).toContain('_setAttr(__root, "id", Number(1))')
    expect(t(HOST('<span id={Boolean(1)}>t</span>'))).toContain(
      '_setAttr(__root, "id", Boolean(1))',
    )
  })

  it('a coercion call with TWO arguments is NOT the pure-coercion shape', () => {
    const out = t(HOST('<span id={String(a, b)}>t</span>'))
    expect(out).not.toContain('_setAttr(__root, "id", String(a, b));\n  return null')
  })

  it('a coercion call with a SPREAD argument is NOT the pure-coercion shape', () => {
    const out = t(HOST('<span id={String(...a)}>t</span>'))
    expect(out).not.toContain('_setAttr(__root, "id", String(...a));\n  return null')
  })

  it('a coercion call with a MEMBER callee is not recognised', () => {
    expect(t(HOST('<span id={g.String(1)}>t</span>'))).not.toContain('_tpl(')
  })
})

describe('jsx.ts — component CHILD expressions: which references stay bare', () => {
  it('an EMPTY expression child of a component is untouched', () => {
    const out = t('export const A = () => <Comp>{/* c */}</Comp>')
    expect(out).toBe('export const A = () => <Comp>{/* c */}</Comp>')
  })

  it('a PROPS-backed child gets the accessor (the getter would freeze if read once)', () => {
    const out = t('function A(props) { return <Comp>{props.title}</Comp> }')
    expect(out).toContain('<Comp>{() => props.title}</Comp>')
  })

  it('`props.children` gets the accessor too', () => {
    expect(t('function A(props) { return <Comp>{props.children}</Comp> }')).toContain(
      '{() => props.children}',
    )
  })

  it('a PLAIN module-const child stays BARE (structural children consumers read it)', () => {
    const out = t('const v = 1\nexport const A = () => <Comp>{v}</Comp>')
    expect(out).toContain('<Comp>{v}</Comp>')
    expect(out).not.toContain('{() => v}')
  })

  it('a plain MEMBER-chain child stays bare', () => {
    const out = t('const o = {}\nexport const A = () => <Comp>{o.a.b}</Comp>')
    expect(out).toContain('<Comp>{o.a.b}</Comp>')
  })

  it('a `this`-rooted member chain stays bare', () => {
    expect(t('export const A = () => <Comp>{this.a}</Comp>')).toContain('<Comp>{this.a}</Comp>')
  })

  it('a COMPUTED member chain is NOT a stable reference — it gets the accessor', () => {
    // Rooted at `props` so the expression is dynamic and actually reaches the
    // stable-reference test; the non-computed sibling above proves the other arm.
    const out = t('function A(props) { return <Comp>{props.a[k]}</Comp> }')
    expect(out).toContain('{() => props.a[k]}')
  })

  it('a NON-computed props chain of the same depth is a stable reference', () => {
    const out = t('function A(props) { return <Comp>{props.a.b}</Comp> }')
    expect(out).toContain('{() => props.a.b}')
  })

  it('a CALL child is not a stable reference — it gets the accessor', () => {
    expect(t('export const A = () => <Comp>{f()}</Comp>')).toContain('{() => f()}')
  })

  it('the same expression under a DOM parent binds reactively instead', () => {
    const out = t('function A(props) { return <div>{props.title}</div> }')
    expect(out).toContain('_bindProp(props, "title"')
  })
})
