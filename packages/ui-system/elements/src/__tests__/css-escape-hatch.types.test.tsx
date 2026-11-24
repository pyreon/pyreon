/**
 * Compile-time lock for the narrowed `css` escape hatch. `tsc --noEmit` (the
 * package typecheck) is the assertion: each `@ts-expect-error` below must stay
 * an error, and every other line must compile.
 */
import { css } from '@pyreon/styler'
import { Element, Text } from '../index'

describe('css prop typing', () => {
  it('rejects a raw CSS string', () => {
    // @ts-expect-error a raw string is not accepted: add a modifier to the component, or write css`…`
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

  it('has no `styles` prop: a one-off look is a modifier on the component', () => {
    // @ts-expect-error there is no per-instance style object prop
    const onElement = <Element styles={{ color: 'red' }} />
    expect(onElement).toBeDefined()
  })
})
