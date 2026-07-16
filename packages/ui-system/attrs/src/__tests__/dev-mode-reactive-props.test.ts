import attrs from '../init'

// --------------------------------------------------------
// EnhancedComponent — dev-mode debug attribute must not freeze reactive props
// --------------------------------------------------------
//
// Contract: the compiler emits `<Comp prop={sig()}>` as `h(Comp, { prop:
// _rp(() => sig()) })` and `makeReactiveProps` converts the brand into a
// property GETTER. The dev-only `data-attrs` debug attribute used to be
// attached with a spread (`{ ...filteredProps, 'data-attrs': name }`), which
// fired every getter once and stored the resolved VALUE — so every reactive
// prop on every attrs-wrapped component was frozen in dev/test while
// production (which skips the debug attribute) stayed live. Upstream report,
// 2026-07. The sibling attrsHoc tests cover the HOC chain; these cover the
// final EnhancedComponent hop the spread lived in.
//
// Bisect-verified: reverting `mergeProps` to the spread fails every spec in
// this file ("expected VALUE descriptor to be GETTER" / fires > 0).

/** Attach a live getter, mirroring what makeReactiveProps produces. */
const withGetter = <T,>(base: Record<string, unknown>, key: string, getValue: () => T) => {
  Object.defineProperty(base, key, {
    get: getValue,
    enumerable: true,
    configurable: true,
  })
  return base
}

/** Inner component that captures the exact props object it receives. */
const makeCapture = () => {
  const captured: { props: Record<string, unknown> | null } = { props: null }
  const Capture = (props: Record<string, unknown>) => {
    captured.props = props
    return null
  }
  return { captured, Capture }
}

describe('attrsComponent dev mode — reactive props survive the data-attrs merge', () => {
  it('runs in a dev-mode process (the branch under test)', () => {
    expect(process.env.NODE_ENV).not.toBe('production')
  })

  it('preserves a getter prop as a live getter and does not fire it at mount', () => {
    let fires = 0
    const props = withGetter({}, 'href', () => {
      fires++
      return `/url-${fires}`
    })

    const { captured, Capture } = makeCapture()
    const Enhanced = attrs({ name: 'Probe', component: Capture as never })
    ;(Enhanced as unknown as (p: unknown) => unknown)(props)

    // The merge must not fire the getter at copy time…
    expect(fires).toBe(0)
    // …and the inner component must see a GETTER, not a frozen value.
    const descriptor = Object.getOwnPropertyDescriptor(captured.props, 'href')
    expect(typeof descriptor?.get).toBe('function')
    expect(descriptor?.value).toBeUndefined()

    // Reads through the descriptor stay live.
    expect(captured.props?.href).toBe('/url-1')
    expect(captured.props?.href).toBe('/url-2')

    // The dev debug attribute is still attached.
    expect(captured.props?.['data-attrs']).toBe('Probe')
  })

  it('a source-backed getter keeps reflecting source updates (dev === prod behavior)', () => {
    // Same shape a signal-backed reactive prop has: the getter re-reads a live
    // source on every access. A spread snapshots it once; a descriptor merge
    // keeps it live.
    let label = 'first'
    const props = withGetter({}, 'label', () => label)

    const { captured, Capture } = makeCapture()
    const Enhanced = attrs({ name: 'SignalProbe', component: Capture as never })
    ;(Enhanced as unknown as (p: unknown) => unknown)(props)

    expect(captured.props?.label).toBe('first')
    label = 'second'
    expect(captured.props?.label).toBe('second')
  })

  it('preserves getters through the filterAttrs (omit) path too', () => {
    let fires = 0
    const props = withGetter({ internalOnly: 1 }, 'title', () => {
      fires++
      return `t-${fires}`
    })

    const { captured, Capture } = makeCapture()
    const Enhanced = attrs({ name: 'FilterProbe', component: Capture as never }).attrs(
      { role: 'note' },
      { filter: ['internalOnly'] },
    )
    ;(Enhanced as unknown as (p: unknown) => unknown)(props)

    expect(fires).toBe(0)
    expect(captured.props?.internalOnly).toBeUndefined()
    const descriptor = Object.getOwnPropertyDescriptor(captured.props, 'title')
    expect(typeof descriptor?.get).toBe('function')
    expect(captured.props?.title).toBe('t-1')
    expect(captured.props?.['data-attrs']).toBe('FilterProbe')
  })
})
