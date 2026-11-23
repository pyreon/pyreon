/**
 * Empty state blocks (`&:hover { ${maybeEmpty} }` with nothing in it) are
 * dropped from a component's CSS before it is hashed and inserted: each one
 * still costs the browser parsing, selector matching and invalidation on every
 * element carrying the class.
 */
import type { VNode } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { css } from '../css'
import { dropEmptyRules, normalizeRuleCSS } from '../resolve'
import { sheet } from '../sheet'
import { styled } from '../styled'

afterEach(() => sheet.clearAll())

describe('dropEmptyRules', () => {
  it('drops empty nested rules and keeps the rest byte-for-byte', () => {
    expect(dropEmptyRules('color: red; &:hover { } &:focus-visible { outline: 1px; } &:active { }')).toBe(
      'color: red; &:focus-visible { outline: 1px; }',
    )
    expect(dropEmptyRules("&:disabled, &[aria-disabled='true'] { } ::selection { background: red; }")).toBe(
      ' ::selection { background: red; }',
    )
  })

  it('drops a rule (or @media) that only held empty rules, innermost first', () => {
    expect(dropEmptyRules('a: b; &:hover { &:focus { } }')).toBe('a: b;')
    expect(dropEmptyRules('a: b; @media (min-width: 1px) { &:hover { } }')).toBe('a: b;')
  })

  it('keeps an empty @layer block (it declares layer order) and braces inside strings', () => {
    expect(dropEmptyRules('@layer a {} b: c;')).toBe('@layer a {} b: c;')
    expect(dropEmptyRules('content: "{ }"; &:x { }')).toBe('content: "{ }";')
    expect(dropEmptyRules("content: '\\'{}'; d: e;")).toBe("content: '\\'{}'; d: e;")
  })

  it('normalizeRuleCSS returns normalizeCSS output untouched when nothing is empty', () => {
    const input = 'color:  red;  &:hover { color: blue; }'
    expect(normalizeRuleCSS(input)).toBe('color: red; &:hover { color: blue; }')
  })
})

// The class is a hash of the final CSS text, so a component whose state block
// is empty gets the SAME class as one written without it: the empty rule was
// dropped before hashing, and the inserted rule is the plain one.
describe('styled() drops empty state rules before hashing', () => {
  const classOf = (v: unknown) => (v as VNode).props.class

  it('a static component', () => {
    const WithEmpty = styled('div')`
      color: red;
      &:hover {
      }
    `
    const Plain = styled('div')`
      color: red;
    `
    expect(classOf(WithEmpty({} as never))).toBe(classOf(Plain({} as never)))
  })

  it('a dynamic component whose state block resolves empty', () => {
    const Box = styled('div')`
      color: red;
      &:hover {
        ${(p: Record<string, unknown>) => (p.hot ? css`color: blue;` : '')}
      }
    `
    const Plain = styled('div')`
      color: ${() => 'red'};
    `
    expect(classOf(Box({} as never))).toBe(classOf(Plain({} as never)))
    expect(classOf(Box({ hot: true } as never))).not.toBe(classOf(Plain({} as never)))
  })
})
