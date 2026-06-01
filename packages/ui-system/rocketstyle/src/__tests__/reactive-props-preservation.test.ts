/**
 * Reactive-prop preservation through the rocketstyle pipeline.
 *
 * Catches the bug class where rocketstyle's HOC + EnhancedComponent
 * COPIED getter-shaped reactive props via value-read + value-write,
 * collapsing the reactive subscription to a static value before the
 * inner component ever saw it. Every downstream JSX accessor reading
 * `props.x` would then see the captured-once value, not the live signal.
 *
 * The contract: `_rp`-branded thunks converted to getter properties by
 * `makeReactiveProps` MUST flow through the rocketstyle pipeline with
 * their getter descriptor intact. Two preservation points:
 *
 *   1. `removeUndefinedProps` — first call site in the attrs HOC (still
 *      a rocketstyle-internal helper because of its undefined-filter
 *      semantic)
 *   2. `mergeProps` from `@pyreon/core` — replaces the `{ ...A, ...B }`
 *      spreads in the attrs HOC + EnhancedComponent's prop merge
 *      (previously a rocketstyle-internal `mergeDescriptors` helper;
 *      consolidated onto the canonical `@pyreon/core` API)
 *
 * If either is reverted to value-copying, these tests fail with the
 * specific failure-mode the production bug exhibits: the consumer
 * reads `props.href` and gets the resolved-once value rather than a
 * getter that fires the underlying signal on every read.
 *
 * Bisect-verified per layer in the PR — see PR description.
 */

import { mergeProps } from '@pyreon/core'
import { removeUndefinedProps } from '../utils/attrs'

describe('removeUndefinedProps — getter preservation', () => {
  it('preserves a getter descriptor through the filter (live read)', () => {
    let calls = 0
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, 'href', {
      get() {
        calls++
        return `https://example.com/page-${calls}`
      },
      enumerable: true,
      configurable: true,
    })

    const filtered = removeUndefinedProps(source)

    // Filter must NOT have fired the getter during the copy step —
    // the live reactive read should happen at downstream consumption.
    expect(calls).toBe(0)

    // Each read fires the getter again, proving the descriptor flowed through.
    expect(filtered.href).toBe('https://example.com/page-1')
    expect(filtered.href).toBe('https://example.com/page-2')
    expect(filtered.href).toBe('https://example.com/page-3')
  })

  it('still strips data properties with undefined values', () => {
    const result = removeUndefinedProps({ a: 1, b: undefined, c: 'x' })
    expect(result).toEqual({ a: 1, c: 'x' })
    expect('b' in result).toBe(false)
  })

  it('preserves null / falsy non-undefined data values (existing contract)', () => {
    const result = removeUndefinedProps({ a: null, b: 0, c: '', d: false })
    expect(result).toEqual({ a: null, b: 0, c: '', d: false })
  })

  it('keeps a getter even though we cannot peek into it (undefined-filter inapplicable)', () => {
    // A getter whose initial fire would return undefined still survives —
    // we can't safely peek without firing the subscription. If the
    // downstream consumer fires it and gets undefined, that's their
    // semantic; rocketstyle stays out of the way.
    let val: unknown = undefined
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, 'href', {
      get: () => val,
      enumerable: true,
      configurable: true,
    })

    const filtered = removeUndefinedProps(source)
    expect('href' in filtered).toBe(true)
    expect(filtered.href).toBeUndefined()

    val = 'http://example.com'
    expect(filtered.href).toBe('http://example.com')
  })
})

describe('mergeProps — getter preservation through merge', () => {
  it('preserves getter descriptors from any source position (later wins)', () => {
    const a = { plain: 'A.plain' } as Record<string, unknown>
    let bCalls = 0
    Object.defineProperty(a, 'shared', {
      value: 'A.shared',
      enumerable: true,
      configurable: true,
      writable: true,
    })

    const b = {} as Record<string, unknown>
    Object.defineProperty(b, 'href', {
      get: () => {
        bCalls++
        return `b-${bCalls}`
      },
      enumerable: true,
      configurable: true,
    })
    Object.defineProperty(b, 'shared', {
      get: () => 'B.shared',
      enumerable: true,
      configurable: true,
    })

    const merged = mergeProps(a, b)

    // Plain value from A survives.
    expect(merged.plain).toBe('A.plain')

    // Getter from B survives and is live (no fire at merge time).
    expect(bCalls).toBe(0)
    expect(merged.href).toBe('b-1')
    expect(merged.href).toBe('b-2')

    // Later source wins — B's getter for 'shared' replaced A's data value.
    expect(merged.shared).toBe('B.shared')
  })

  it('returns empty object for no sources', () => {
    expect(mergeProps()).toEqual({})
  })

  it('a plain spread WOULD fire getters — descriptor merge does not (regression catcher)', () => {
    // This test specifically catches the value-spread regression. If
    // `mergeProps` is replaced with `Object.assign(target, ...sources)`
    // or `{ ...A, ...B }`, getter calls happen at merge time and this
    // test fails with `expect(calls).toBe(0)` -> got >= 1.
    let calls = 0
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, 'href', {
      get: () => {
        calls++
        return 'value'
      },
      enumerable: true,
      configurable: true,
    })

    const merged = mergeProps({}, source)
    expect(calls).toBe(0)

    // Sanity — descriptor IS there and works on read.
    expect(merged.href).toBe('value')
    expect(calls).toBe(1)
  })
})

describe('end-to-end pipeline — getter survives the rocketstyle hop chain', () => {
  it('reactive prop flows through removeUndefinedProps + mergeProps without firing the getter', () => {
    // Synthesises the exact pipeline shape in rocketstyleAttrsHoc.ts
    // (removeUndefinedProps + mergeProps twice). Confirms the
    // combined transformation preserves reactivity end-to-end.
    let calls = 0
    const inputProps = {} as Record<string, unknown>
    Object.defineProperty(inputProps, 'href', {
      get: () => {
        calls++
        return `live-${calls}`
      },
      enumerable: true,
      configurable: true,
    })
    inputProps.size = 'large' // plain value

    // Step 1 (HOC): filter undefined, preserve getter.
    const filtered = removeUndefinedProps(inputProps)
    expect(calls).toBe(0)

    // Step 2 (HOC): inner merge for attrs callback input.
    const innerMerge = mergeProps({ tag: 'a' }, filtered)
    expect(calls).toBe(0)

    // Step 3 (HOC): final merge before wrapped-component handoff.
    const finalProps = mergeProps({}, { tag: 'a' }, filtered)
    expect(calls).toBe(0)

    // Now the wrapped-component consumer reads — getter fires once per read.
    expect(finalProps.href).toBe('live-1')
    expect(finalProps.size).toBe('large')
    expect(innerMerge.href).toBe('live-2')
  })
})
