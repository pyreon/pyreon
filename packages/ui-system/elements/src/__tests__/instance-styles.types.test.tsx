/**
 * Compile-time lock for the typed per-instance override (`styles`) and the
 * narrowed `css` escape hatch. `tsc --noEmit` (the package typecheck) is the
 * assertion: each `@ts-expect-error` below must stay an error, and every other
 * line must compile.
 */
import { css } from '@pyreon/styler'
import type { StyleOverride, StylesCallback } from '../index'
import { Element, Text } from '../index'

describe('styles prop typing', () => {
  it('accepts the shapes a .theme() value takes', () => {
    const single = <Element styles={{ gridTemplateColumns: 'repeat(3, 1fr)', paddingTop: 16 }} />
    const breakpoints = <Element styles={{ gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, 1fr)' } }} />
    const mobileFirst = <Element styles={{ paddingTop: [8, null, 16] }} />
    const pseudo = <Element styles={{ color: 'red', hover: { color: 'blue' }, disabled: { opacity: 0.5 } }} />
    const byMode: StylesCallback = (_theme, mode) => ({ color: mode('black', 'white') })
    const callback = <Text styles={byMode} />
    expect([single, breakpoints, mobileFirst, pseudo, callback]).toHaveLength(5)
  })

  it('rejects a misspelt property', () => {
    // @ts-expect-error `gridTemplateColumn` is not a unistyle property
    const misspelt: StyleOverride = { gridTemplateColumn: 'repeat(3, 1fr)' }
    // @ts-expect-error CSS-spec order is not the unistyle key (`borderWidthTop`)
    const specOrder = <Element styles={{ borderTopWidth: 1 }} />
    expect([misspelt, specOrder]).toHaveLength(2)
  })

  it('has no free-text or selector escape inside the override', () => {
    // @ts-expect-error `extendCss` (CSS text) is not a key of the override
    const text: StyleOverride = { extendCss: 'color: red;' }
    // @ts-expect-error an arbitrary selector is not a key
    const selector: StyleOverride = { '& > span': { color: 'red' } }
    // @ts-expect-error pseudo groups do not nest
    const nested: StyleOverride = { hover: { focus: { color: 'red' } } }
    expect([text, selector, nested]).toHaveLength(3)
  })
})

describe('css prop typing', () => {
  it('rejects a raw CSS string', () => {
    // @ts-expect-error a raw string is no longer accepted: use `styles`, or css`…`
    const onElement = <Element css="color: red;" />
    // @ts-expect-error same per breakpoint
    const perBreakpoint = <Element css={{ md: 'color: red;' }} />
    // @ts-expect-error same on Text
    const onText = <Text css="color: red;" />
    expect([onElement, perBreakpoint, onText]).toHaveLength(3)
  })

  it('keeps the tagged-template escape hatch', () => {
    const tagged = <Element css={css`color: red;`} />
    const callback = <Element css={(c) => c`color: red;`} />
    const perBreakpoint = <Text css={{ md: css`color: red;` }} />
    expect([tagged, callback, perBreakpoint]).toHaveLength(3)
  })
})
