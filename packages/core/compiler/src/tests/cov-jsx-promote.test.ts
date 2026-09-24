/**
 * Branch coverage — `jsx.ts` DIRECT-TIER auto-promotions (the `_bindDirect` /
 * `selector.subscribe` fast paths) and the template attribute emitter.
 *
 * Every promotion has a bail catalogue; each spec pairs a promoted shape with
 * the neighbouring shape that must fall back to the general tracked binding.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const t = (src: string, o: Record<string, unknown> = {}) => transformJSX_JS(src, 'in.tsx', o).code
const bothAgree = (src: string, o: Record<string, unknown> = {}) => {
  const js = transformJSX_JS(src, 'in.tsx', o).code
  expect(transformJSX(src, 'in.tsx', o).code).toBe(js)
  return js
}
const SIG = 'const count = signal(0)\n'
const SEL = 'const sel = createSelector(cur)\n'

describe('jsx.ts — signal METHOD-call promotion (`{count().toFixed(2)}`)', () => {
  it('promotes a pure-primitive method on a bare signal read', () => {
    const out = bothAgree(`${SIG}export const A = () => <div>{count().toFixed(2)}</div>`)
    expect(out).toContain('_bindDirect(count, (v) => { __t0.data = v.toFixed(2) })')
    expect(out).not.toContain('bindPolymorphicText')
  })

  it('declines a method NOT on the pure safelist', () => {
    const out = t(`${SIG}export const A = () => <div>{count().push(1)}</div>`)
    expect(out).toContain('bindPolymorphicText')
    expect(out).not.toContain('_bindDirect')
  })

  it('declines a COMPUTED method access', () => {
    const out = t(`${SIG}export const A = () => <div>{count()["toFixed"](2)}</div>`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('declines when the RECEIVER call carries arguments (a signal write, not a read)', () => {
    const out = t(`${SIG}export const A = () => <div>{count(1).toFixed(2)}</div>`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('declines when a METHOD ARGUMENT contains another signal read', () => {
    const out = t(`${SIG}export const A = () => <div>{count().toFixed(count())}</div>`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('declines a SPREAD method argument', () => {
    const out = t(`${SIG}export const A = () => <div>{count().toFixed(...a)}</div>`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('declines when the receiver is not a tracked signal', () => {
    const out = t('export const A = () => <div>{foo().toFixed(2)}</div>')
    expect(out).toContain('bindPolymorphicText')
  })

  it('declines when the receiver is not a call at all', () => {
    const out = t(`${SIG}export const A = () => <div>{o.x.toFixed(2)}</div>`)
    expect(out).not.toContain('_bindDirect')
  })

  it('a method-call ATTRIBUTE keeps the general tracked binding (this promotion is text-only)', () => {
    const out = t(`${SIG}export const A = () => <div title={count().toFixed(2)}>x</div>`)
    expect(out).toContain('_bind(')
    expect(out).not.toContain('_bindDirect(count, (v) => { __t0')
  })
})

describe('jsx.ts — direct-tier ATTRIBUTE bindings', () => {
  it('a BARE signal attribute takes the 2-arg direct form', () => {
    const out = bothAgree(`${SIG}export const A = () => <div title={count}>x</div>`)
    expect(out).toContain('_bindDirect(count, (v) => _setAttr(__root, "title", v))')
  })

  it('a DEPTH-1 member accessor hands the runtime the receiver instead of a thunk', () => {
    const out = t('export const A = () => <div title={() => row.label()}>x</div>')
    expect(out).toContain('_bindDirect(row.label, (v) => _setAttr(__root, "title", v), undefined, row)')
  })

  it('a DEEPER member accessor keeps the thunk (re-reading the receiver could double-fire a getter)', () => {
    const out = t('export const A = () => <div title={() => row.data.name()}>x</div>')
    expect(out).toContain('() => row.data.name()')
    expect(out).not.toContain(', undefined, row.data)')
  })

  it('a COMPUTED member accessor declines the direct tier entirely', () => {
    const out = t('export const A = () => <div title={() => row["l"]()}>x</div>')
    expect(out).toContain('_bind(')
    expect(out).not.toContain('_bindDirect')
  })

  it('a member chain ROOTED at a tracked signal declines (that would be `count.peek()`)', () => {
    const out = t(`${SIG}export const A = () => <div title={() => count.peek()}>x</div>`)
    expect(out).not.toContain('_bindDirect(count.peek')
  })
})

describe('jsx.ts — selector-ternary promotion (`sel(k) ? a : b`)', () => {
  it('promotes a text child to `sel.subscribe`', () => {
    const out = bothAgree(`${SEL}export const A = () => <div>{() => sel(k) ? "X" : "Y"}</div>`)
    expect(out).toContain('sel.subscribe(k, (m) => { __t0.data = (m ? "X" : "Y") })')
  })

  it('promotes an ATTRIBUTE the same way', () => {
    const out = t(`${SEL}export const A = () => <div class={() => sel(k) ? "a" : "b"}>x</div>`)
    expect(out).toContain('sel.subscribe(k, (m) => { _setClass(__root, (m ? "a" : "b")) })')
  })

  it('unwraps a PARENTHESIZED ternary body', () => {
    const out = t(`${SEL}export const A = () => <div>{() => (sel(k) ? "X" : "Y")}</div>`)
    expect(out).toContain('sel.subscribe(k,')
  })

  it('declines a selector called with TWO arguments', () => {
    const out = t(`${SEL}export const A = () => <div>{() => sel(k, z) ? "X" : "Y"}</div>`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('declines a MEMBER-expression selector callee', () => {
    const out = t(`${SEL}export const A = () => <div>{() => o.sel(k) ? "X" : "Y"}</div>`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('declines a callee that is not a tracked `createSelector` result', () => {
    const out = t('export const A = () => <div>{() => other(k) ? "X" : "Y"}</div>')
    expect(out).not.toContain('.subscribe(')
  })

  it('declines when the KEY contains a signal read (the key would freeze at mount)', () => {
    const out = t(`${SEL}${SIG}export const A = () => <div>{() => sel(count()) ? "X" : "Y"}</div>`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('declines when the CONSEQUENT contains a signal read', () => {
    const out = t(`${SEL}${SIG}export const A = () => <div>{() => sel(k) ? count() : "Y"}</div>`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('declines when the ALTERNATE contains a signal read', () => {
    const out = t(`${SEL}${SIG}export const A = () => <div>{() => sel(k) ? "X" : count()}</div>`)
    expect(out).toContain('bindPolymorphicText')
  })

  it('accepts a MEMBER key (a stable `<For>` row property)', () => {
    const out = t(`${SEL}export const A = () => <div>{() => sel(row.id) ? "X" : "Y"}</div>`)
    expect(out).toContain('sel.subscribe(row.id,')
  })

  it('declines a non-ternary body', () => {
    const out = t(`${SEL}export const A = () => <div>{() => sel(k)}</div>`)
    expect(out).not.toContain('.subscribe(')
  })
})

describe('jsx.ts — non-arrow function attribute values are invoked, not passed', () => {
  it('a FUNCTION EXPRESSION attribute value is wrapped in an IIFE', () => {
    const out = t('export const A = () => <div title={function () { return x }}>y</div>')
    expect(out).toContain('(function () { return x })()')
  })

  it('a BLOCK-bodied arrow attribute value is wrapped in an IIFE too', () => {
    const out = t('export const A = () => <div title={() => { return x }}>y</div>')
    expect(out).toContain('(() => { return x })()')
  })

  it('a CONCISE arrow attribute value is unwrapped to its body', () => {
    const out = t('export const A = () => <div title={() => x}>y</div>')
    expect(out).toContain('_setAttr(__root, "title", x)')
    expect(out).not.toContain('(() => x)()')
  })
})

describe('jsx.ts — template attribute emitter: reserved names and duplicates', () => {
  it('`key` on a templatable element bails the whole template', () => {
    const out = t('<div key="a" id="b">x</div>')
    expect(out).not.toContain('_tpl(')
  })

  it('a plain attribute AFTER a spread bails to h() — JSX object semantics make it win', () => {
    // `<a {...p} rel="noopener">` ≡ `{...p, rel: "noopener"}` — the static
    // value must beat the spread's key. The template path baked the static
    // into the HTML and applied the spread LAST (and a dynamic spread re-applies
    // on every change), so a caller-controlled `p.rel` silently overrode the
    // guard written to defeat it. The h() path spreads into one object and is
    // correct by construction, so the element is bailed to it.
    const out = bothAgree('<div id="a" {...p} id="b">x</div>')
    expect(out).not.toContain('_tpl(')
    expect(out).toContain('<div id="a" {...p} id="b">x</div>')
    expect(bothAgree('<a {...p} rel="noopener" href="/safe">x</a>')).not.toContain('_tpl(')
  })

  it('a single plain attribute alongside a spread is kept', () => {
    const out = t('<div id="a" {...p}>x</div>')
    expect(out).toContain('id=\\"a\\"')
  })
})
