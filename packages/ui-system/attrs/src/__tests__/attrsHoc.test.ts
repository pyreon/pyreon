import { h } from '@pyreon/core'
import createAttrsHOC from '../hoc/attrsHoc'

const Receiver = (props: any) => ({
  type: 'div',
  props: { ...props, 'data-testid': 'receiver' },
  children: props.label ?? '',
  key: null,
})

// --------------------------------------------------------
// attrsHoc - props merging
// --------------------------------------------------------
describe('attrsHoc - props merging', () => {
  it('should pass through props unchanged when no attrs defined', () => {
    const hoc = createAttrsHOC({ attrs: [], priorityAttrs: [] })
    const Enhanced = hoc(Receiver)

    const result = Enhanced({ label: 'hello', 'data-custom': 'yes' }) as any
    expect(result.children).toBe('hello')
    expect(result.props['data-custom']).toBe('yes')
  })

  it('should apply attrs as default props', () => {
    const hoc = createAttrsHOC({
      attrs: [(_props: any) => ({ label: 'default' })],
      priorityAttrs: [],
    })
    const Enhanced = hoc(Receiver)

    const result = Enhanced({}) as any
    expect(result.children).toBe('default')
  })

  it('should let explicit props override attrs', () => {
    const hoc = createAttrsHOC({
      attrs: [() => ({ label: 'from-attrs' })],
      priorityAttrs: [],
    })
    const Enhanced = hoc(Receiver)

    const result = Enhanced({ label: 'explicit' }) as any
    expect(result.children).toBe('explicit')
  })

  it('should apply priorityAttrs with lowest precedence', () => {
    const hoc = createAttrsHOC({
      attrs: [(_props: any) => ({ label: 'from-attrs' })],
      priorityAttrs: [(_props: any) => ({ label: 'from-priority' })],
    })
    const Enhanced = hoc(Receiver)

    const result = Enhanced({}) as any
    expect(result.children).toBe('from-attrs')
  })

  it('should merge results from multiple attrs functions', () => {
    const hoc = createAttrsHOC({
      attrs: [() => ({ 'data-first': 'a' }), () => ({ 'data-second': 'b' })],
      priorityAttrs: [],
    })
    const Enhanced = hoc(Receiver)

    const result = Enhanced({}) as any
    expect(result.props['data-first']).toBe('a')
    expect(result.props['data-second']).toBe('b')
  })

  it('should remove undefined props so they dont override defaults', () => {
    const hoc = createAttrsHOC({
      attrs: [() => ({ label: 'default-label' })],
      priorityAttrs: [],
    })
    const Enhanced = hoc(Receiver)

    const result = Enhanced({ label: undefined }) as any
    expect(result.children).toBe('default-label')
  })

  it('should allow null to override defaults', () => {
    const hoc = createAttrsHOC({
      attrs: [() => ({ label: 'default-label' })],
      priorityAttrs: [],
    })
    const Enhanced = hoc(Receiver)

    const result = Enhanced({ label: null }) as any
    expect(result.children).toBe('')
  })
})

// --------------------------------------------------------
// attrsHoc - attrs callback receives props
// --------------------------------------------------------
describe('attrsHoc - attrs callback receives props', () => {
  it('should pass filtered props to attrs callback', () => {
    const attrsFn = vi.fn(() => ({}))
    const hoc = createAttrsHOC({
      attrs: [attrsFn],
      priorityAttrs: [],
    })
    const Enhanced = hoc(Receiver)

    Enhanced({ variant: 'primary', size: 'lg' })
    expect(attrsFn).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'primary', size: 'lg' }),
    )
  })

  it('should pass priority attrs merged with props to attrs callback', () => {
    const attrsFn = vi.fn(() => ({}))
    const hoc = createAttrsHOC({
      attrs: [attrsFn],
      priorityAttrs: [() => ({ fromPriority: true })],
    })
    const Enhanced = hoc(Receiver)

    Enhanced({ variant: 'primary' })
    expect(attrsFn).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'primary', fromPriority: true }),
    )
  })
})

// --------------------------------------------------------
// attrsHoc - ref passthrough
// --------------------------------------------------------
describe('attrsHoc - ref passthrough', () => {
  it('should pass ref as a normal prop to wrapped component', () => {
    const hoc = createAttrsHOC({ attrs: [], priorityAttrs: [] })
    const Enhanced = hoc(Receiver)

    const refObj = { current: null }
    const result = Enhanced({ ref: refObj }) as any
    expect(result.props.ref).toBe(refObj)
  })
})

// ─── attrsHoc — real h() round-trip (parallel to the Receiver mock) ──
//
// The Receiver above is a mock that returns a `{ type, props,
// children, key }` literal. The tests assert against that shape.
// This block re-runs the core HOC contracts against a Receiver that
// builds its return value via real `h()` from `@pyreon/core` —
// catches divergence between the mock shape and the actual VNode
// shape h() produces.

describe('attrsHoc — real h() round-trip', () => {
  // Receiver that returns a real VNode via h() instead of a literal.
  const ReceiverH = (props: any) =>
    h('div', { ...props, 'data-testid': 'receiver' }, props.label ?? '')

  it('passes through props unchanged when no attrs defined', () => {
    const hoc = createAttrsHOC({ attrs: [], priorityAttrs: [] })
    const Enhanced = hoc(ReceiverH as any)
    const result = Enhanced({ label: 'hello', 'data-custom': 'yes' }) as any
    expect(result.props.label).toBe('hello')
    expect(result.props['data-custom']).toBe('yes')
    expect(result.type).toBe('div')
  })

  it('applies attrs as default props through real h()', () => {
    const hoc = createAttrsHOC({
      attrs: [(_props: any) => ({ label: 'default' })],
      priorityAttrs: [],
    })
    const Enhanced = hoc(ReceiverH as any)
    const result = Enhanced({}) as any
    expect(result.props.label).toBe('default')
  })

  it('passes ref through real h() output unchanged', () => {
    const hoc = createAttrsHOC({ attrs: [], priorityAttrs: [] })
    const Enhanced = hoc(ReceiverH as any)
    const refObj = { current: null }
    const result = Enhanced({ ref: refObj }) as any
    expect(result.props.ref).toBe(refObj)
  })
})

// --------------------------------------------------------
// attrsHoc — reactive-prop descriptor preservation
// --------------------------------------------------------
//
// Contract: when the compiler emits `<Comp prop={signal()}>` it produces
// `h(Comp, { prop: _rp(() => signal()) })`. `mount.ts` then runs
// `makeReactiveProps` which converts each `_rp`-branded function into a
// property GETTER on the props object. Any HOC in the chain that
// VALUE-COPIES the prop (`result[key] = props[key]`) fires the getter
// and stores the resolved value — collapsing the live subscription to a
// one-shot snapshot. Downstream code never re-reads the signal; the DOM
// stops updating.
//
// The fix uses `Object.getOwnPropertyDescriptors` + `Object.defineProperty`
// in `removeUndefinedProps` and `mergeDescriptors`. These tests assert
// getter identity is preserved through every spread/merge point —
// bisect-verifiable by reverting either helper to plain value-copy
// (the regression shape from PR #793 that this fix repairs).
describe('attrsHoc — reactive-prop descriptor preservation', () => {
  const Capture = (props: any) => ({ type: 'div', props, children: null, key: null })

  const withGetter = <T,>(base: Record<string, unknown>, key: string, getValue: () => T) => {
    Object.defineProperty(base, key, {
      get: getValue,
      enumerable: true,
      configurable: true,
    })
    return base
  }

  it('removeUndefinedProps preserves a getter-shaped prop without firing it', () => {
    let fires = 0
    const props = withGetter({}, 'href', () => {
      fires++
      return `/url-${fires}`
    })

    const hoc = createAttrsHOC({ attrs: [], priorityAttrs: [] })
    const Enhanced = hoc(Capture as any)
    const result = Enhanced(props) as any

    // Fast path (no chain) → only removeUndefinedProps fires. fires === 0
    // proves it didn't fire the getter at copy time.
    expect(fires).toBe(0)
    const descriptor = Object.getOwnPropertyDescriptor(result.props, 'href')
    expect(typeof descriptor?.get).toBe('function')
    expect(descriptor?.value).toBeUndefined()

    // Subsequent reads through the descriptor fire the getter live —
    // proves the subscription survives the HOC pipeline.
    expect(result.props.href).toBe('/url-1')
    expect(result.props.href).toBe('/url-2')
  })

  it('preserves getter descriptor through the full attrs + priorityAttrs merge', () => {
    let fires = 0
    const props = withGetter({}, 'href', () => {
      fires++
      return `/live-${fires}`
    })

    const hoc = createAttrsHOC({
      attrs: [(_p: any) => ({ label: 'from-attrs' })],
      priorityAttrs: [(_p: any) => ({ 'data-priority': 'yes' })],
    })
    const Enhanced = hoc(Capture as any)
    const result = Enhanced(props) as any

    // The full merge path (priority → attrs → filteredProps) ran. `href`
    // is in filteredProps (highest-precedence layer, last wins) — MUST
    // still be a getter at the receiver, not a captured value.
    expect(fires).toBe(0)
    const descriptor = Object.getOwnPropertyDescriptor(result.props, 'href')
    expect(typeof descriptor?.get).toBe('function')

    // Static layers (from object-literal callbacks) come through as data
    // descriptors — that's fine, they carry no getters.
    expect(result.props.label).toBe('from-attrs')
    expect(result.props['data-priority']).toBe('yes')

    // The getter still fires live on every read at the receiver.
    expect(result.props.href).toBe('/live-1')
    expect(result.props.href).toBe('/live-2')
  })

  it('preserves getter at the .attrs() callback argument site', () => {
    let attrsCbReads = 0
    const props = withGetter({}, 'href', () => '/x')
    const hoc = createAttrsHOC({
      attrs: [
        (p: any) => {
          // Reading p.href inside the .attrs() callback IS expected to
          // fire the getter — this is the contract for live-read
          // .attrs() chains. The bug would manifest as p.href being a
          // captured snapshot instead of a live read.
          if (p.href !== undefined) attrsCbReads++
          return { 'data-from-attrs': p.href ?? 'no-href' }
        },
      ],
      priorityAttrs: [],
    })
    const Enhanced = hoc(Capture as any)
    const result = Enhanced(props) as any

    // The .attrs() callback received `mergeDescriptors(prioritized,
    // filteredProps)` (when priority is set) OR `filteredProps` directly
    // (when not). In either case, the callback's `p.href` must be a live
    // getter read.
    expect(attrsCbReads).toBe(1)
    expect(result.props['data-from-attrs']).toBe('/x')

    // Receiver still sees the live getter.
    expect(result.props.href).toBe('/x')
  })
})
