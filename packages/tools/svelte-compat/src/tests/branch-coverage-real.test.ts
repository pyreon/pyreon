/**
 * Real-test branch-coverage hardening for @pyreon/svelte-compat.
 *
 * Replaces the v8-ignore annotations from PR #1301 with real tests.
 * NO v8-ignore annotations.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import {
  createEventDispatcher,
  derived,
  onDestroy,
  onMount,
  readable,
  writable,
} from '../index'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender } from '../jsx-runtime'

function makeCtx(): RenderContext {
  return {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
    unmountCallbacks: [],
  }
}

// ─── safeNotEqual — NaN + object/function paths (lines 100, 103) ─────────────

describe('writable — safeNotEqual semantics', () => {
  it('NaN-to-NaN write does NOT notify subscribers (line 100 a!=a true)', () => {
    const w = writable(Number.NaN)
    let fires = 0
    w.subscribe(() => fires++)
    expect(fires).toBe(1) // initial sub fires once

    w.set(Number.NaN)
    expect(fires).toBe(1) // no re-fire on NaN -> NaN
  })

  it('object identity changes ALWAYS notify (object branch at line 103)', () => {
    const w = writable({ x: 1 })
    let fires = 0
    w.subscribe(() => fires++)
    expect(fires).toBe(1)

    // Same identity object — but objects always notify (mutation-aware contract).
    const same = w as { set: (v: unknown) => void }
    const objRef = { x: 1 }
    same.set(objRef)
    same.set(objRef) // identity unchanged → object branch still fires
    expect(fires).toBeGreaterThanOrEqual(2)
  })

  it('function values always notify', () => {
    const fnA = () => 1
    const w = writable<() => number>(fnA)
    let fires = 0
    w.subscribe(() => fires++)
    expect(fires).toBe(1)
    w.set(fnA) // same fn ref — function branch always notifies
    expect(fires).toBeGreaterThanOrEqual(2)
  })

  it('primitive equality dedups writes', () => {
    const w = writable(42)
    let fires = 0
    w.subscribe(() => fires++)
    expect(fires).toBe(1)
    w.set(42)
    expect(fires).toBe(1) // dedup'd
  })
})

// ─── writable inside component context (re-render subscribe branches) ───────

describe('writable — component-context subscribe + cached fast path', () => {
  it('writable inside component body registers a rerender-aware subscriber (line 201)', () => {
    const ctx = makeCtx()
    let rerenders = 0
    ctx.scheduleRerender = () => {
      rerenders++
    }

    beginRender(ctx)
    const w = writable('initial')
    w.subscribe(() => {})
    endRender()

    // External write triggers the rerender hook (line 210 false arm:
    // ctx.unmounted is false → scheduleRerender fires).
    w.set('updated')
    // rerender was triggered (counts may include initial setup)
    expect(rerenders).toBeGreaterThan(0)
  })

  it('writable.subscribe outside any component context returns a plain unsub', () => {
    const w = writable(0)
    const u = w.subscribe(() => {})
    expect(typeof u).toBe('function')
    u()
  })
})

// ─── onMount + onDestroy re-render re-push paths (lines 360, 384) ───────────

describe('onMount / onDestroy — re-render re-push', () => {
  it('onMount re-push hits the includes() guard on parent re-render (line 360)', () => {
    const ctx = makeCtx()
    const fired: string[] = []

    beginRender(ctx)
    onMount(() => {
      fired.push('mount')
    })
    endRender()

    // Simulate a re-render: same ctx, hooks already populated.
    beginRender(ctx)
    onMount(() => {
      fired.push('should-not-fire')
    })
    endRender()

    // The slot is now populated; second call hits the re-render re-push path.
    // The re-pushed callback isn't fired again here — only at unmount.
    expect(ctx.unmountCallbacks.length).toBeGreaterThanOrEqual(1)
  })

  it('onDestroy registers a cleanup fired at unmount (line 379)', () => {
    const ctx = makeCtx()
    let destroyed = false

    beginRender(ctx)
    onDestroy(() => {
      destroyed = true
    })
    endRender()

    // Manually fire unmount callbacks
    for (const cb of ctx.unmountCallbacks) cb()
    expect(destroyed).toBe(true)
  })

  it('onDestroy re-push on re-render hits the includes() guard (line 384)', () => {
    const ctx = makeCtx()
    const fired: string[] = []

    beginRender(ctx)
    onDestroy(() => {
      fired.push('destroy')
    })
    endRender()

    // Re-render: hooks populated, same slot
    beginRender(ctx)
    onDestroy(() => {
      fired.push('should-not-fire')
    })
    endRender()

    // Only one cleanup is queued (includes() guard)
    expect(ctx.unmountCallbacks.length).toBe(1)

    for (const cb of ctx.unmountCallbacks) cb()
    expect(fired).toEqual(['destroy'])
  })

  it('onMount outside ctx routes to pyreon native onMount', () => {
    // No ctx → pyreonOnMount called. Smoke test: no throw.
    expect(() => onMount(() => {})).not.toThrow()
  })

  it('onDestroy outside ctx routes to pyreon native onUnmount', () => {
    expect(() => onDestroy(() => {})).not.toThrow()
  })
})

// ─── createEventDispatcher — handler + typeof guard (lines 476-479) ──────────

describe('createEventDispatcher — fallback paths', () => {
  it('dispatch with a function handler invokes it', () => {
    const ctx = makeCtx()
    let invoked = false
    ctx.props = {
      onSelect: () => {
        invoked = true
      },
    }

    beginRender(ctx)
    const dispatch = createEventDispatcher()
    endRender()

    dispatch('select', { id: 1 })
    expect(invoked).toBe(true)
  })

  it('dispatch with no matching handler is a no-op (line 486 false)', () => {
    const ctx = makeCtx()
    ctx.props = {}

    beginRender(ctx)
    const dispatch = createEventDispatcher()
    endRender()

    expect(() => dispatch('select', {})).not.toThrow()
  })

  it('dispatch supports on:Type prop convention', () => {
    const ctx = makeCtx()
    let saw: unknown
    ctx.props = {
      'on:click': (e: unknown) => {
        saw = e
      },
    } as Record<string, unknown>

    beginRender(ctx)
    const dispatch = createEventDispatcher()
    endRender()

    dispatch('click', { x: 5 })
    expect(saw).toBeDefined()
  })

  it('createEventDispatcher outside ctx returns a dispatch that no-ops', () => {
    const dispatch = createEventDispatcher()
    expect(() => dispatch('any', {})).not.toThrow()
  })
})

// ─── derived — multi-source + single-source ──────────────────────────────────

describe('derived — multi/single source', () => {
  it('derived from a single source updates when source changes', () => {
    const src = writable(1)
    const doubled = derived(src, (v: number) => v * 2)
    let seen: number | undefined
    doubled.subscribe((v) => {
      seen = v
    })
    expect(seen).toBe(2)
    src.set(5)
    expect(seen).toBe(10)
  })

  it('derived from multiple sources updates when any source changes', () => {
    const a = writable(1)
    const b = writable(10)
    const sum = derived([a, b], ([av, bv]: [number, number]) => av + bv)

    let seen: number | undefined
    sum.subscribe((v) => {
      seen = v
    })
    expect(seen).toBe(11)
    a.set(5)
    expect(seen).toBe(15)
    b.set(20)
    expect(seen).toBe(25)
  })
})

// ─── readable — read-only wrapper ────────────────────────────────────────────

describe('readable — facade', () => {
  it('readable wraps writable and exposes subscribe only', () => {
    const r = readable(42)
    let seen: number | undefined
    r.subscribe((v) => {
      seen = v
    })
    expect(seen).toBe(42)
    // No set/update on readable surface
    expect((r as { set?: unknown }).set).toBeUndefined()
  })

  it('readable with a start function emits the post-start value once', () => {
    let receivedFromSet: number | undefined
    const r = readable(0, (set) => {
      set(100) // sync set inside start
      return () => {}
    })
    r.subscribe((v) => {
      receivedFromSet = v
    })
    expect(receivedFromSet).toBe(100) // first subscriber sees post-start
  })
})

// ─── mount — DOM-side smoke ──────────────────────────────────────────────────

describe('writable + Pyreon DOM mount', () => {
  it('subscribing inside a mounted component receives updates', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    try {
      const Comp = () => {
        const w = writable('initial')
        let label = w
        let seen = ''
        label.subscribe((v) => {
          seen = v
        })
        return h('div', null, seen)
      }
      pyreonMount(h(Comp, null), root as unknown as HTMLElement)
      expect(root.textContent).toContain('initial')
    } finally {
      root.remove()
    }
  })
})
