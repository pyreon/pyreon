/**
 * Branch coverage — `jsx.ts` TEXT FUSION (`_fuse(...)`): adjacent text and
 * expression children collapsed into ONE binding instead of one per part.
 *
 * Fusion moves JSX text into a JS string literal, so anything the text path
 * would not have bound AS TEXT has to bail. Each spec pairs a fused shape with
 * the neighbouring bail.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const SIG = 'const count = signal(0)\n'
const t = (src: string, o: Record<string, unknown> = {}) =>
  transformJSX_JS(SIG + src, 'in.tsx', o).code
const bothAgree = (src: string, o: Record<string, unknown> = {}) => {
  const js = transformJSX_JS(SIG + src, 'in.tsx', o).code
  expect(transformJSX(SIG + src, 'in.tsx', o).code).toBe(js)
  return js
}
const SSR = { ssr: true, ssrTemplate: true } as const

describe('jsx.ts — the fused shape', () => {
  it('fuses text + signal + text into ONE `_fuse` binding', () => {
    const out = bothAgree('export const A = () => <span>n: {count()}!</span>')
    expect(out).toContain('_fuse("n: ", count(), "!")')
    expect(out).toContain('_tpl("<span> </span>"')
    expect(out).not.toContain('<!>')
  })

  it('fuses two adjacent EXPRESSION parts', () => {
    expect(t('export const A = () => <span>{a}{count()}</span>')).toContain('_fuse(a, count())')
  })

  it('bakes a LITERAL part into the fused string rather than passing it', () => {
    expect(t('export const A = () => <span>{"x"}{count()}</span>')).toContain('_fuse("x", count())')
  })

  it('does NOT fuse a single part (nothing to join)', () => {
    const out = t('export const A = () => <span>{count()}</span>')
    expect(out).not.toContain('_fuse(')
    expect(out).toContain('_bindText(count')
  })

  it('does NOT fuse when NO part is reactive', () => {
    const out = t('export const A = () => <span>a {b} c</span>')
    expect(out).not.toContain('_fuse(')
  })

  it('an EMPTY expression container between parts is skipped, not fused', () => {
    expect(t('export const A = () => <span>n: {/* c */}{count()}!</span>')).toContain(
      '_fuse("n: ", count(), "!")',
    )
  })

  it('fuses on the SSR path too', () => {
    const out = t('export const A = () => <span>n: {count()}!</span>', SSR)
    expect(out).toContain('_fuse("n: ", count(), "!")')
  })
})

describe('jsx.ts — fusion BAILS on text carrying an HTML entity', () => {
  it('a `&` in JSX text bails (fusion would render the literal characters)', () => {
    const out = t('export const A = () => <span>a &amp; {count()}!</span>')
    expect(out).not.toContain('_fuse(')
    expect(out).toContain('a &amp; ')
    expect(out).toContain('_bindText(count')
  })

  it('the same bail applies on the SSR path', () => {
    const out = t('export const A = () => <span>a &amp; {count()}!</span>', SSR)
    expect(out).not.toContain('_fuse(')
  })

  it('a `&` inside a JS STRING literal part is fine — JSX never decodes it', () => {
    expect(t('export const A = () => <span>{"a & b"}{count()}</span>')).toContain('_fuse(')
  })
})

describe('jsx.ts — fusion BAILS on parts the text path would not bind as text', () => {
  it('a `children` MEMBER read bails (children mount, they do not stringify)', () => {
    const out = t('function A(props) { return <span>{props.children}{count()}</span> }')
    expect(out).not.toContain('_fuse(')
    expect(out).toContain('_mountSlot(() => (props.children)')
  })

  it('a BARE `children` identifier bails too', () => {
    const out = t('function A({ children }) { return <span>{children}{count()}</span> }')
    expect(out).not.toContain('_fuse(')
    expect(out).toContain('_mountSlot(children')
  })

  it('an ELEMENT-valued const part bails', () => {
    const out = t('const el = <b/>\nexport const A = () => <span>{el}{count()}</span>')
    expect(out).not.toContain('_fuse(')
    expect(out).toContain('_mountSlot(el')
  })

  it('an in-file JSX-HELPER call part bails', () => {
    const out = t('const cell = (v) => <b/>\nexport const A = () => <span>{cell(1)}{count()}</span>')
    expect(out).not.toContain('_fuse(')
    expect(out).toContain('_mountSlot(() => (cell(1))')
  })

  it('a part that CONTAINS JSX bails', () => {
    const out = t('export const A = () => <span>{c ? <b/> : null}{count()}</span>')
    expect(out).not.toContain('_fuse(')
  })

  it('an ELEMENT sibling bails the whole fusion', () => {
    const out = t('export const A = () => <span>n: {count()}<b/></span>')
    expect(out).not.toContain('_fuse(')
  })
})

describe('jsx.ts — function-valued fusion parts are INVOKED into the fused string', () => {
  it('a CONCISE arrow part contributes its body', () => {
    expect(t('export const A = () => <span>{() => x}{count()}</span>')).toContain(
      '_fuse(x, count())',
    )
  })

  it('a FUNCTION EXPRESSION part contributes an IIFE', () => {
    expect(t('export const A = () => <span>{function () { return x }}{count()}</span>')).toContain(
      '_fuse((function () { return x })(), count())',
    )
  })

  it('a BLOCK-bodied arrow part contributes an IIFE too', () => {
    expect(t('export const A = () => <span>{() => { return x }}{count()}</span>')).toContain(
      '_fuse((() => { return x })(), count())',
    )
  })
})

describe('jsx.ts — `key` bails the template wherever it appears', () => {
  it('on the ROOT element', () => {
    expect(transformJSX_JS('<div key="k" id="a">x</div>', 'in.tsx').code).not.toContain('_tpl(')
  })

  it('on a NESTED element', () => {
    expect(transformJSX_JS('<div><span key="k" id="a"/></div>', 'in.tsx').code).not.toContain(
      '_tpl(',
    )
  })

  it('and the same tree without `key` DOES templatize', () => {
    expect(transformJSX_JS('<div><span id="a"/></div>', 'in.tsx').code).toContain('_tpl(')
  })
})
