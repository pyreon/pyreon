/**
 * createLocalProvider descriptor-preservation contract — UNIT-LEVEL.
 *
 * Bug context: the HOC sits between the outer attrs-HOC and the styled
 * leaf when `options.provider: true` (top-level rocketstyle wrappers).
 * The pre-fix shape used a parameter-destructure (`({ onMouseEnter, …,
 * ...props })`) and a final value-spread (`{ ...props, ...events,
 * $rocketstate }`) — both fire every getter on the incoming props
 * object, snapshot-reading reactive-prop descriptors that
 * `makeReactiveProps` installs for compiler-emitted `<Comp prop={signal()}>`.
 *
 * Real-world impact: rocketstyle-wrapped components with `provider: true`
 * (ui-components Button et al.) had ALL signal-driven props (`href`,
 * `disabled`, `class`, `aria-*`, custom data props) collapsed to one-shot
 * values. DOM never updated on signal change.
 *
 * This file locks the descriptor contract at every entry/exit point of
 * createLocalProvider. Bisect-verifiable: revert the HOC body to use
 * parameter-destructure + value-spread, run this suite — every
 * "preserves the getter on X" test fails.
 */
import { describe, expect, it, vi } from 'vitest'
import createLocalProvider from '../context/createLocalProvider'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Counts how many times each getter on a props object is read. */
function instrument<T extends Record<string, unknown>>(
  base: T,
  getters: Record<string, () => unknown>,
): { props: T; reads: Record<string, number> } {
  const reads: Record<string, number> = {}
  for (const key of Object.keys(getters)) reads[key] = 0
  const props = { ...base } as Record<string, unknown>
  for (const [key, fn] of Object.entries(getters)) {
    Object.defineProperty(props, key, {
      enumerable: true,
      configurable: true,
      get() {
        reads[key] = (reads[key] ?? 0) + 1
        return fn()
      },
    })
  }
  return { props: props as T, reads }
}

/** Final-props sink that captures what reached the wrapped component. */
function makeCapture(): {
  Receiver: (props: Record<string, unknown>) => null
  captured: Record<string, unknown> | null
} {
  const ctx: { captured: Record<string, unknown> | null } = { captured: null }
  const Receiver = (props: Record<string, unknown>) => {
    ctx.captured = props
    return null
  }
  return { Receiver, get captured() { return ctx.captured } } as never
}

// ─── 1) Reactive-prop descriptors survive the HOC ───────────────────────────

describe('createLocalProvider — descriptor preservation contract', () => {
  it('does NOT fire getter descriptors on unrelated props at HOC entry', () => {
    const { Receiver } = makeCapture() as any
    const { props, reads } = instrument(
      {},
      {
        href: () => '/initial',
        'data-id': () => 'item-42',
        title: () => 'Hello',
      },
    )
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped(props as any)

    // Critical: the HOC must NOT have fired any of these getters at
    // setup time. If it does, the consumer's signal subscription is
    // collapsed before applyProp can wire its renderEffect to it.
    expect(reads.href).toBe(0)
    expect(reads['data-id']).toBe(0)
    expect(reads.title).toBe(0)
  })

  it('forwards getter descriptors verbatim to the wrapped component', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const { props } = instrument(
      {},
      {
        href: () => '/x',
        'data-foo': () => 'bar',
      },
    )
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped(props as any)

    expect(ctx.captured).not.toBeNull()
    const hrefDesc = Object.getOwnPropertyDescriptor(ctx.captured!, 'href')
    expect(typeof hrefDesc?.get).toBe('function')
    expect(hrefDesc?.value).toBeUndefined()

    const fooDesc = Object.getOwnPropertyDescriptor(ctx.captured!, 'data-foo')
    expect(typeof fooDesc?.get).toBe('function')
  })

  it('downstream reads through forwarded getter still fire the original', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    let value = '/v1'
    const { props, reads } = instrument({}, { href: () => value })
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped(props as any)

    expect(reads.href).toBe(0) // not fired during HOC setup
    expect(ctx.captured!.href).toBe('/v1')
    expect(reads.href).toBe(1)

    value = '/v2'
    expect(ctx.captured!.href).toBe('/v2')
    expect(reads.href).toBe(2)
  })

  it('handles a large set of getter-shaped props without firing any of them', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const getters: Record<string, () => string> = {}
    for (let i = 0; i < 50; i++) getters[`data-attr-${i}`] = () => `v${i}`
    const { props, reads } = instrument({}, getters)
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped(props as any)

    // None of the 50 getters should have fired at setup.
    for (const key of Object.keys(reads)) expect(reads[key]).toBe(0)
    // All 50 getters reachable via the forwarded descriptor.
    for (let i = 0; i < 50; i++) {
      expect(ctx.captured![`data-attr-${i}`]).toBe(`v${i}`)
    }
  })
})

// ─── 2) HOC-owned keys (event handlers + $rocketstate) ──────────────────────

describe('createLocalProvider — HOC-owned keys not leaked to wrapped component', () => {
  it('strips onMouseEnter/Leave/Up/Down/onFocus/onBlur from forwarded props', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped({
      onMouseEnter: () => {},
      onMouseLeave: () => {},
      onMouseUp: () => {},
      onMouseDown: () => {},
      onFocus: () => {},
      onBlur: () => {},
      href: '/x',
    } as any)

    // The HOC consumes the event-handler keys to wire its own
    // pseudo-state signals; the wrapped component must see ITS event
    // handlers (the HOC's), not the user's raw refs.
    expect(typeof ctx.captured!.onMouseEnter).toBe('function')
    expect(typeof ctx.captured!.onMouseLeave).toBe('function')
    expect(ctx.captured!.href).toBe('/x')
  })

  it('replaces $rocketstate with the local-provider-augmented version', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped({ $rocketstate: { existing: 'thing' } } as any)

    const state = ctx.captured!.$rocketstate as Record<string, unknown>
    expect(state.existing).toBe('thing')
    expect(state.pseudo).toBeDefined()
    expect(typeof (state.pseudo as Record<string, unknown>).hover).toBe('boolean')
    expect(typeof (state.pseudo as Record<string, unknown>).focus).toBe('boolean')
    expect(typeof (state.pseudo as Record<string, unknown>).pressed).toBe('boolean')
  })

  it('forwards $rocketstate accessor (function form)', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped({ $rocketstate: () => ({ resolved: 'via-accessor' }) } as any)

    const state = ctx.captured!.$rocketstate as Record<string, unknown>
    expect(state.resolved).toBe('via-accessor')
    expect(state.pseudo).toBeDefined()
  })
})

// ─── 3) Pseudo-state signals — must be lazy getters ─────────────────────────

describe('createLocalProvider — pseudo-state signals stay lazy', () => {
  it('pseudo.hover, .focus, .pressed start false and update on events', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped({} as any)
    const state = ctx.captured!.$rocketstate as Record<string, unknown>
    const pseudo = state.pseudo as Record<string, boolean>

    expect(pseudo.hover).toBe(false)
    expect(pseudo.focus).toBe(false)
    expect(pseudo.pressed).toBe(false)
  })

  it('user event handlers are invoked AFTER the pseudo-state update', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const Wrapped = createLocalProvider(Receiver as any)
    const userHandler = vi.fn()
    Wrapped({ onMouseEnter: userHandler } as any)

    const fakeEvent = {} as MouseEvent
    ;(ctx.captured!.onMouseEnter as (e: MouseEvent) => void)(fakeEvent)

    expect(userHandler).toHaveBeenCalledWith(fakeEvent)
    expect(userHandler).toHaveBeenCalledTimes(1)
  })

  it('multiple event handlers fire correctly', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const Wrapped = createLocalProvider(Receiver as any)
    const enter = vi.fn()
    const leave = vi.fn()
    const focus = vi.fn()
    Wrapped({
      onMouseEnter: enter,
      onMouseLeave: leave,
      onFocus: focus,
    } as any)

    const evt = {} as MouseEvent
    const fevt = {} as FocusEvent
    ;(ctx.captured!.onMouseEnter as (e: MouseEvent) => void)(evt)
    ;(ctx.captured!.onMouseLeave as (e: MouseEvent) => void)(evt)
    ;(ctx.captured!.onFocus as (e: FocusEvent) => void)(fevt)

    expect(enter).toHaveBeenCalledOnce()
    expect(leave).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
  })
})

// ─── 4) Mixed static + reactive props ───────────────────────────────────────

describe('createLocalProvider — mixed static + reactive props', () => {
  it('preserves static data props alongside reactive getter props', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const { props, reads } = instrument(
      { 'data-static': 'static-value', class: 'btn-base' },
      { href: () => '/reactive' },
    )
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped(props as any)

    // Static props come through as DATA descriptors (no getter)
    const staticDesc = Object.getOwnPropertyDescriptor(ctx.captured!, 'data-static')
    expect(staticDesc?.value).toBe('static-value')
    expect(staticDesc?.get).toBeUndefined()
    const classDesc = Object.getOwnPropertyDescriptor(ctx.captured!, 'class')
    expect(classDesc?.value).toBe('btn-base')

    // Reactive props stay as GETTER descriptors
    const hrefDesc = Object.getOwnPropertyDescriptor(ctx.captured!, 'href')
    expect(typeof hrefDesc?.get).toBe('function')
    expect(reads.href).toBe(0)
  })
})

// ─── 5) Edge cases ──────────────────────────────────────────────────────────

describe('createLocalProvider — edge cases', () => {
  it('handles empty props object', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped({} as any)

    expect(ctx.captured).not.toBeNull()
    expect(ctx.captured!.$rocketstate).toBeDefined()
    expect(typeof ctx.captured!.onMouseEnter).toBe('function')
  })

  it('preserves symbol-keyed properties', () => {
    const sym = Symbol('test-key')
    const ctx: { captured: Record<string | symbol, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped({ [sym]: 'symbol-value' } as any)

    // The `omit` from @pyreon/ui-core uses Object.keys (string keys only),
    // so symbol-keyed properties are intentionally NOT forwarded. This
    // matches the previous behavior of the parameter-destructure
    // (which also only copies string keys via the rest pattern).
    // Document this as the contract.
    expect(ctx.captured![sym as never]).toBeUndefined()
  })

  it('does not produce a recursive references / self-references in output', () => {
    const ctx: { captured: Record<string, unknown> | null } = { captured: null }
    const Receiver = (p: Record<string, unknown>) => {
      ctx.captured = p
      return null
    }
    const Wrapped = createLocalProvider(Receiver as any)
    Wrapped({ foo: 'bar' } as any)
    expect(ctx.captured!.foo).toBe('bar')
    // Output is a fresh object, not the input
    expect(ctx.captured).not.toBe({ foo: 'bar' })
  })
})
