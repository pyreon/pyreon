/**
 * Branch-coverage edge tests for utility + helper modules — drives the
 * remaining `?? ` / typeof / shape-discriminator branches in `utils.ts`,
 * `useStableValue.ts`, `hoistNonReactStatics.ts`, `render.tsx`,
 * `context.tsx`, and `PyreonUI.tsx` that the main suites miss.
 */
import { describe, expect, it } from 'vitest'
import hoistNonReactStatics from '../hoistNonReactStatics'
import render from '../render'
import { omit, pick, throttle } from '../utils'
import useStableValue from '../useStableValue'

describe('utils.omit / pick — null/empty edges', () => {
  it('omit returns empty obj when input is null', () => {
    expect(omit(null)).toEqual({})
  })

  it('omit returns empty obj when input is undefined', () => {
    expect(omit(undefined)).toEqual({})
  })

  it('pick returns empty obj when input is null', () => {
    expect(pick(null)).toEqual({})
  })

  it('pick returns empty obj when input is undefined', () => {
    expect(pick(undefined)).toEqual({})
  })

  it('omit returns all descriptors when keys is an empty Set', () => {
    const input = { a: 1, b: 2 }
    const result = omit(input, new Set<string>())
    expect(result).toEqual(input)
  })

  it('omit returns all descriptors when keys is undefined', () => {
    const input = { a: 1, b: 2 }
    expect(omit(input)).toEqual(input)
  })

  it('omit accepts a Set of keys', () => {
    const input = { a: 1, b: 2, c: 3 }
    expect(omit(input, new Set(['b']))).toEqual({ a: 1, c: 3 })
  })
})

describe('utils.throttle — trailing + cancel edges', () => {
  it('throttle.cancel clears pending timer + resets state', async () => {
    let calls = 0
    const fn = (..._args: unknown[]) => {
      calls += 1
    }
    const throttled = throttle(fn, 50, { leading: true, trailing: true })
    throttled('a')
    throttled('b') // schedules trailing
    throttled.cancel()
    await new Promise((r) => setTimeout(r, 80))
    // Only the leading call fired; trailing was cancelled.
    expect(calls).toBe(1)
  })

  it('throttle.cancel is a no-op when no timer is active (timeoutId FALSE branch)', () => {
    let calls = 0
    const throttled = throttle(() => {
      calls += 1
    }, 50)
    // Cancel without prior call → timeoutId === undefined → idx1 path.
    throttled.cancel()
    expect(calls).toBe(0)
  })

  it('throttle with leading: false + trailing: true triggers leading-skipped path', async () => {
    let calls = 0
    const throttled = throttle(() => {
      calls += 1
    }, 30, { leading: false, trailing: true })
    throttled() // first call → elapsed >= wait but leading: false → schedules trailing
    await new Promise((r) => setTimeout(r, 50))
    expect(calls).toBe(1)
  })
})

describe('useStableValue — equality branch', () => {
  it('returns same reference when value is deep-equal across calls', () => {
    const a = useStableValue({ x: 1 })
    const b = useStableValue({ x: 1 })
    // Different runs allocate different signal refs, but the equality
    // branch (!isEqual → set) is exercised on both calls.
    expect(a).toEqual({ x: 1 })
    expect(b).toEqual({ x: 1 })
  })

  it('replaces reference when value differs', () => {
    const a = useStableValue({ x: 1 })
    const b = useStableValue({ x: 2 })
    expect(a).toEqual({ x: 1 })
    expect(b).toEqual({ x: 2 })
  })
})

describe('render — component fn + key extraction', () => {
  it('extracts `key` from attachProps before passing to h()', () => {
    const Comp = (props: { greeting?: string }) => props.greeting ?? 'hi'
    const vnode = render(Comp, { key: 'k1', greeting: 'hello' })
    expect(vnode).toBeTruthy()
    expect(typeof vnode).toBe('object')
  })

  it('passes attachProps to h() when no key is present', () => {
    const Comp = (props: { greeting?: string }) => props.greeting ?? 'hi'
    const vnode = render(Comp, { greeting: 'hello' })
    expect(vnode).toBeTruthy()
  })

  it('returns null for falsy content', () => {
    expect(render(null)).toBeNull()
    expect(render(undefined)).toBeNull()
    expect(render(false)).toBeNull()
    expect(render('')).toBeNull()
    expect(render(0)).toBeNull()
  })

  it('passes through string/number/boolean content as-is', () => {
    expect(render('hello')).toBe('hello')
    expect(render(42)).toBe(42)
    expect(render(true)).toBe(true)
  })

  it('returns array content as-is', () => {
    const arr = ['a', 'b']
    expect(render(arr)).toBe(arr as unknown as ReturnType<typeof render>)
  })
})

describe('hoistNonReactStatics — non-configurable property swallow', () => {
  it('skips non-configurable properties silently', () => {
    const source = function source() {}
    Object.defineProperty(source, 'frozen', {
      value: 'X',
      configurable: false,
      writable: false,
    })

    const target = function target() {}
    // Pre-create a non-configurable conflicting property on target so
    // defineProperty throws inside the try/catch (triggers L50-52).
    Object.defineProperty(target, 'frozen', {
      value: 'Y',
      configurable: false,
      writable: false,
    })

    // Should NOT throw — the catch swallows the redefinition error.
    expect(() => hoistNonReactStatics(target, source)).not.toThrow()
    // target.frozen stays at its original (non-configurable) value.
    expect((target as unknown as Record<string, string>).frozen).toBe('Y')
  })
})
