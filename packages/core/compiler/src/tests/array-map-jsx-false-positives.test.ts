/**
 * `array-map-jsx` (#4363) fired on ANY `.map()` whose parent was a JSX
 * expression, including an attribute value that maps data. It now fires only
 * for a `.map()` rendered as children whose callback renders JSX (or is not
 * inline, so it cannot be told). Each false positive from the report is a
 * fixture here, next to the shapes that must still be reported.
 *
 * Bisect-verified: with the old parent-only check the four "not reported"
 * fixtures each report `array-map-jsx`.
 */
import { describe, expect, it } from 'vitest'
import { detectReactPatterns } from '../react-intercept'

const codes = (src: string) => detectReactPatterns(src).map((d) => d.code)

describe('array-map-jsx: reported only for a rendered list', () => {
  it.each([
    ['an attribute that maps data (the report)', `const T = (props) => <Table columns={['Item', 'Qty']} rows={props.lines.map((l) => [l.item, l.qty])} />`],
    ['an attribute whose callback returns JSX', `const T = (p) => <Tabs items={p.tabs.map((t) => <b>{t}</b>)} />`],
    ['a child .map() that returns strings', `const L = (p) => <p>{p.names.map((n) => n.toUpperCase())}</p>`],
    ['a block callback returning a non-JSX value', `const L = (p) => <p>{p.xs.map((x) => { const y = x * 2; return y })}</p>`],
  ])('not reported: %s', (_name, src) => {
    expect(codes(src)).not.toContain('array-map-jsx')
  })

  it.each([
    ['the classic list', `const L = (p) => <ul>{p.todos.map((t) => <li>{t.text}</li>)}</ul>`],
    ['inside a fragment', `const L = (p) => <>{p.todos.map((t) => <li>{t.text}</li>)}</>`],
    ['a parenthesised / conditional JSX result', `const L = (p) => <ul>{p.xs.map((x) => (x.ok ? <li>{x.n}</li> : null))}</ul>`],
    ['a block body returning JSX', `const L = (p) => <ul>{p.xs.map((x) => { if (!x) return null; return <li>{x}</li> })}</ul>`],
    ['a function expression', `const L = (p) => <ul>{p.xs.map(function (x) { return <li>{x}</li> })}</ul>`],
    ['a non-inline callback (cannot be told, rendered as children)', `const L = (p) => <ul>{p.xs.map(renderRow)}</ul>`],
  ])('reported: %s', (_name, src) => {
    expect(codes(src)).toContain('array-map-jsx')
  })

  it('a nested function returning JSX inside a non-JSX callback does not count', () => {
    const src = `const L = (p) => <p>{p.xs.map((x) => { const r = () => <i />; return x })}</p>`
    expect(codes(src)).not.toContain('array-map-jsx')
  })
})
