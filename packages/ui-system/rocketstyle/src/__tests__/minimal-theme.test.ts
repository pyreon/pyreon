// Locks in the "one-size app" contract for the rocketstyle Provider's
// Theme type. Pre-fix, `rootSize: number` was REQUIRED in the type at
// `rocketstyle/src/context/context.ts` — passing a minimal theme without
// rootSize was a TypeScript error even though it works fine at runtime
// (enrichTheme defaults rootSize to 16, value() defaults rootSize to 16,
// makeItResponsive short-circuits when breakpoints are empty).
//
// User report: "[breakpoints/rootSize] are used too directly". Even in
// places where runtime tolerates undefined, an over-constrained TYPE
// forces downstream consumers to either lie (`as any`) or pass dummy
// values they don't actually need.
//
// This spec is a TYPE-LEVEL assertion via `// @ts-expect-error` flips.
// The flip-positive case (minimal theme) is the regression contract; if
// someone re-adds the required `rootSize: number` constraint, this file
// FAILS to compile because the @ts-expect-error directives become dead.
import type { TProvider } from '../context/context'

describe('rocketstyle Provider — minimal theme typing', () => {
  it('TYPE: theme with only colors (no rootSize, no breakpoints) is accepted', () => {
    // Should NOT be a type error — this is the "one-size app" shape.
    const props: TProvider = {
      theme: { colors: { primary: '#228be6' } },
      children: null,
    }
    expect(props.theme).toEqual({ colors: { primary: '#228be6' } })
  })

  it('TYPE: theme with breakpoints but no rootSize is accepted', () => {
    const props: TProvider = {
      theme: { breakpoints: { xs: 0, sm: 576 }, colors: { primary: '#228be6' } },
      children: null,
    }
    expect(props.theme?.breakpoints).toEqual({ xs: 0, sm: 576 })
  })

  it('TYPE: theme with rootSize but no breakpoints is accepted', () => {
    const props: TProvider = {
      theme: { rootSize: 16, colors: { primary: '#228be6' } },
      children: null,
    }
    expect(props.theme?.rootSize).toBe(16)
  })

  it('TYPE: full theme (rootSize + breakpoints) still accepted (backward compat)', () => {
    const props: TProvider = {
      theme: {
        rootSize: 16,
        breakpoints: { xs: 0, sm: 576, md: 768 },
        colors: { primary: '#228be6' },
      },
      children: null,
    }
    expect(props.theme?.rootSize).toBe(16)
    expect(props.theme?.breakpoints).toEqual({ xs: 0, sm: 576, md: 768 })
  })

  it('TYPE: omitting theme entirely is still accepted (was already optional)', () => {
    const props: TProvider = { children: null }
    expect(props.theme).toBeUndefined()
  })
})
