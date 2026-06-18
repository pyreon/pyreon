import attrsComponent from '../attrs'
import attrs from '../init'
import createAttrsHOC from '../hoc/attrsHoc'

// Receiver that returns the merged props so we can inspect the final shape.
// Typed `any` so the literal-VNode mock satisfies ComponentFn<any> at the
// `hoc(Receiver)` / `attrsComponent({ component })` call sites (matches the
// existing Receiver mock convention in attrsHoc.test.ts).
const Receiver: any = (props: any) => ({ type: 'div', props, children: null, key: null })

const renderProps = (Component: any, props: Record<string, any> = {}) => {
  const vnode = Component(props) as any
  return vnode?.props ?? vnode
}

// --------------------------------------------------------
// attrsHoc — chain-presence branches (attrs.length ?? 0)
// --------------------------------------------------------
//
// `hasAttrs = (attrs?.length ?? 0) > 0` and the priority equivalent use the
// `?? 0` nullish coalesce — the right-hand side fires only when the chain
// array is null/undefined (not the empty-array default the public init path
// always supplies). Direct `createAttrsHOC` callers can pass undefined.
describe('attrsHoc — nullish chain arrays', () => {
  it('treats undefined attrs as no-chain fast path', () => {
    const hoc = createAttrsHOC({
      attrs: undefined as any,
      priorityAttrs: undefined as any,
    })
    const Enhanced = hoc(Receiver)
    const result = Enhanced({ label: 'x' }) as any
    // No chain → fast path → props pass through untouched.
    expect(result.props.label).toBe('x')
  })

  it('treats undefined priorityAttrs but real attrs correctly', () => {
    const hoc = createAttrsHOC({
      attrs: [() => ({ label: 'default' })],
      priorityAttrs: undefined as any,
    })
    const Enhanced = hoc(Receiver)
    const result = Enhanced({}) as any
    expect(result.props.label).toBe('default')
  })
})

// --------------------------------------------------------
// attrsHoc — priorityAttrs-only merge path (no attrs)
// --------------------------------------------------------
//
// Exercises:
//   - `hasAttrs ? calculateAttrs(...) : null` → the null else (line 59)
//   - the `prioritizedAttrs ? mergeProps(prioritizedAttrs, filteredProps) : …`
//     middle arm of the finalProps ternary (line 85) — priorityAttrs set,
//     finalAttrs null.
describe('attrsHoc — priorityAttrs only (no attrs chain)', () => {
  it('merges priority defaults under explicit props with attrs empty', () => {
    const hoc = createAttrsHOC({
      attrs: [],
      priorityAttrs: [() => ({ label: 'from-priority', 'data-p': 'yes' })],
    })
    const Enhanced = hoc(Receiver)

    // explicit `label` wins over priority; data-p comes from priority.
    const result = Enhanced({ label: 'explicit' }) as any
    expect(result.props.label).toBe('explicit')
    expect(result.props['data-p']).toBe('yes')
  })

  it('applies priority defaults when explicit props absent', () => {
    const hoc = createAttrsHOC({
      attrs: [],
      priorityAttrs: [() => ({ label: 'from-priority' })],
    })
    const Enhanced = hoc(Receiver)
    const result = Enhanced({}) as any
    expect(result.props.label).toBe('from-priority')
  })
})

// --------------------------------------------------------
// cloneAndEnhance — filterAttrs accumulation branches
// --------------------------------------------------------
//
// `[...(defaultOpts.filterAttrs ?? []), ...(opts.filterAttrs ?? [])]` — the
// `opts.filterAttrs ?? []` right-hand fires when a chaining call sets attrs
// WITHOUT a filter (so opts carries no filterAttrs key), exercised by a plain
// `.attrs(fn)` chain.
describe('cloneAndEnhance — filterAttrs accumulation', () => {
  it('preserves filterAttrs across a subsequent non-filter chain call', () => {
    const Base = attrs({ name: 'B', component: Receiver as any })
      .attrs(() => ({ label: 'a' }), { filter: ['secret'] })
      // second chain WITHOUT filter → opts.filterAttrs undefined → `?? []`
      .attrs(() => ({ 'data-b': 'b' }))

    const result = renderProps(Base, { secret: 'leak', label: 'x' })
    // filter from the first chain still strips `secret`.
    expect(result.secret).toBeUndefined()
    expect(result['data-b']).toBe('b')
  })

  it('accumulates filterAttrs from multiple filtered chains', () => {
    const Base = attrs({ name: 'B', component: Receiver as any })
      .attrs(() => ({}), { filter: ['one'] })
      .attrs(() => ({}), { filter: ['two'] })

    const result = renderProps(Base, { one: 1, two: 2, keep: 3 })
    expect(result.one).toBeUndefined()
    expect(result.two).toBeUndefined()
    expect(result.keep).toBe(3)
  })
})

// --------------------------------------------------------
// attrsComponent — direct construction sanity (non-init path)
// --------------------------------------------------------
describe('attrsComponent — direct construction', () => {
  it('accumulates filterAttrs when defaultOpts omits the key', () => {
    // Construct directly WITHOUT a filterAttrs key so the first chain call's
    // cloneAndEnhance sees `defaultOpts.filterAttrs === undefined` →
    // `?? []` right-hand fallback (the otherwise public-API-unreachable arm,
    // since init.ts always seeds filterAttrs: []).
    const Base = attrsComponent({
      component: Receiver as any,
      attrs: [],
      priorityAttrs: [],
      compose: {},
      statics: {},
    } as any)

    const WithFilter = Base.attrs(() => ({ label: 'y' }), { filter: ['secret'] })
    const result = renderProps(WithFilter, { secret: 'leak', keep: 1 })
    expect(result.secret).toBeUndefined()
    expect(result.keep).toBe(1)
  })

  it('derives name from component.displayName when name omitted', () => {
    const Named = (props: any) => ({ type: 'div', props, children: null, key: null })
    ;(Named as any).displayName = 'FromDisplay'

    const Component = attrsComponent({
      component: Named as any,
      attrs: [],
      priorityAttrs: [],
      filterAttrs: [],
      compose: {},
      statics: {},
    } as any)

    expect(Component.displayName).toBe('FromDisplay')
  })
})
