/**
 * Compile-time lock for the style-modifier design. `tsc --noEmit` (the package
 * typecheck) is the assertion: each `@ts-expect-error` must stay an error and
 * every other line must compile.
 *
 * A modifier definition takes every value form a `.theme()` value takes
 * (single value, mobile-first array, breakpoint object, `mode()` pair) and
 * the pseudo groups, with its keys checked against `StylesDefault` (here
 * unistyle's `ITheme`, via `@pyreon/ui-theme`). Before, a dimension slice
 * typed only single values and no pseudo groups, so the responsive and hover
 * forms the runtime supports did not compile.
 */
import { el } from '../factory'

const Base = el
  .config({ name: 'TypesGrid' })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }))

const Grid = Base.multiple((_t, m) => ({
  threeUp: { gridTemplateColumns: { md: 'repeat(3, minmax(0, 1fr))' } },
  stepped: { paddingTop: [8, null, 16] },
  dense: { gap: 8 },
  tinted: { color: m('black', 'white'), hover: { color: { md: m('red', 'pink') } } },
  states: { focus: { color: 'red' }, active: { color: 'red' }, disabled: { opacity: 0.5 } },
}))

const compact = (): boolean => false

describe('style modifier typing', () => {
  it('accepts every value form and pseudo group in the definition', () => {
    expect(Grid).toBeDefined()
  })

  it('rejects a misspelt or CSS-spec key, and a nested pseudo group', () => {
    // @ts-expect-error `gridTemplateColumn` is not a unistyle property
    const misspelt = Base.multiple({ typo: { gridTemplateColumn: 'x' } })
    // @ts-expect-error CSS-spec order is not the unistyle key (`borderWidthTop`)
    const specOrder = Base.multiple({ spec: { borderTopWidth: 1 } })
    // @ts-expect-error pseudo groups do not nest
    const nested = Base.multiple({ nest: { hover: { focus: { color: 'red' } } } })
    expect([misspelt, specOrder, nested]).toHaveLength(3)
  })

  it('the call site: a string, a list, and conditional entries', () => {
    const one = <Grid multiple="threeUp" />
    const two = <Grid multiple={['threeUp', 'dense']} />
    const conditional = <Grid multiple={['threeUp', compact() && 'dense', null, undefined]} />
    expect([one, two, conditional]).toHaveLength(3)
  })

  it('rejects an unknown modifier, and booleans under useBooleans: false', () => {
    // @ts-expect-error `nope` is not a modifier of Grid
    const unknown = <Grid multiple={['nope']} />
    // @ts-expect-error also in conditional position
    const conditional = <Grid multiple={['threeUp', compact() && 'nope']} />
    // @ts-expect-error the boolean shorthand needs `useBooleans: true`
    const boolean = <Grid threeUp />
    expect([unknown, conditional, boolean]).toHaveLength(3)
  })
})
