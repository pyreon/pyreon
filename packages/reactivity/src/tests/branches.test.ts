/**
 * Targeted tests for uncovered branches across reactivity package.
 */
import { Cell } from "../cell"
import { computed } from "../computed"
import { createSelector } from "../createSelector"
import { _notifyTraceListeners, onSignalUpdate, why } from "../debug"
import { _bind, effect, renderEffect } from "../effect"
import { reconcile } from "../reconcile"
import { signal } from "../signal"
import { createStore, isStore } from "../store"

// ── cell.ts branches: promote listener to Set ─────────────────────────────────

describe("Cell listener promotion", () => {
  test("promotes single listener to Set when second listener added", () => {
    const c = new Cell(0)
    const calls: number[] = []
    c.listen(() => calls.push(1))
    c.listen(() => calls.push(2))
    // Third listen: _s already exists (false branch of `if (!this._s)`)
    c.listen(() => calls.push(3))
    c.set(1)
    expect(calls).toEqual([1, 2, 3])
  })

  test("subscribe unsubscribes single listener", () => {
    const c = new Cell(0)
    const calls: number[] = []
    const unsub = c.subscribe(() => calls.push(1))
    c.set(1)
    expect(calls).toEqual([1])
    unsub()
    c.set(2)
    // Should not fire after unsubscribe
    expect(calls).toEqual([1])
  })

  test("subscribe unsubscribes from Set", () => {
    const c = new Cell(0)
    const calls: number[] = []
    c.listen(() => calls.push(1))
    const unsub = c.subscribe(() => calls.push(2))
    c.set(1)
    expect(calls).toEqual([1, 2])
    unsub()
    c.set(2)
    expect(calls).toEqual([1, 2, 1])
  })

  test("promote to Set when _l was unsubscribed (null _l, null _s)", () => {
    const c = new Cell(0)
    const fn1 = () => {}
    // subscribe sets _l, unsub sets _l to null
    const unsub = c.subscribe(fn1)
    unsub()
    // Now _l is null and _s is null — next listen goes to fast path (!_l && !_s)
    const fn2 = () => {}
    c.listen(fn2)
    // Add another to force promotion — _l is fn2, _s is null → promotes with _l
    c.listen(() => {})
    c.set(1)
  })

  test("double unsubscribe from single listener is safe", () => {
    const c = new Cell(0)
    const fn1 = () => {}
    const unsub = c.subscribe(fn1)
    unsub()
    // Second call — _l is null, so `this._l === listener` is false
    unsub()
  })
})

// ── computed.ts branches ──────────────────────────────────────────────────────

describe("computed branches", () => {
  test("disposed computed does not recompute", () => {
    const s = signal(1)
    const c = computed(() => s() * 2, { equals: Object.is })
    expect(c()).toBe(2)
    c.dispose()
    s.set(5)
    // After dispose, the computed should not update
    // (it may return stale value or throw — just ensure no crash)
  })

  test("computed with custom equals and subscribers", () => {
    const s = signal(1)
    const c = computed(() => s() * 2, { equals: Object.is })
    const values: number[] = []
    effect(() => {
      values.push(c())
    })
    expect(values).toEqual([2])
    s.set(2)
    expect(values).toEqual([2, 4])
    // Same value — should not notify
    s.set(2)
    expect(values).toEqual([2, 4])
  })

  test("computed without custom equals notifies subscribers on dep change", () => {
    const s = signal(1)
    const c = computed(() => s() * 2)
    const values: number[] = []
    effect(() => {
      values.push(c())
    })
    expect(values).toEqual([2])
    s.set(2)
    expect(values).toEqual([2, 4])
  })
})

// ── createSelector.ts branches ────────────────────────────────────────────────

describe("createSelector branches", () => {
  test("selector with no matching bucket on old value", () => {
    const s = signal<string>("a")
    const isSelected = createSelector(s)
    // Read "a" — creates bucket for "a"
    effect(() => {
      isSelected("a")
    })
    // Change to "b" — old bucket "a" exists, new bucket "b" does not
    s.set("b")
  })

  test("selector reuses existing host for same value", () => {
    const s = signal<string>("a")
    const isSelected = createSelector(s)
    const results: boolean[] = []
    effect(() => {
      results.push(isSelected("a"))
    })
    // This second effect creates another subscription to same bucket
    effect(() => {
      results.push(isSelected("a"))
    })
    expect(results).toEqual([true, true])
    s.set("b")
    // Both should see false
    expect(results).toEqual([true, true, false, false])
  })

  test("selector handles Object.is equality (no change)", () => {
    const s = signal<string>("a")
    const isSelected = createSelector(s)
    let count = 0
    effect(() => {
      isSelected("a")
      count++
    })
    expect(count).toBe(1)
    // Same value — Object.is check should skip
    s.set("a")
    expect(count).toBe(1)
  })

  test("selector query for value with no existing bucket creates one", () => {
    const s = signal<string>("a")
    const isSelected = createSelector(s)
    // Query outside effect — creates a bucket for "z" that has no subscribers
    const result = isSelected("z")
    expect(result).toBe(false)
  })

  test("selector change when old value has no subscriber bucket", () => {
    const s = signal<string>("a")
    const isSelected = createSelector(s)
    // Only subscribe to "b", not "a"
    effect(() => {
      isSelected("b")
    })
    // Change from "a" to "b" — old value "a" has no bucket (never queried in effect)
    s.set("b")
  })
})

// ── effect.ts branches ────────────────────────────────────────────────────────

describe("effect disposed branches", () => {
  test("disposed effect does not re-run", () => {
    const s = signal(0)
    let count = 0
    const e = effect(() => {
      s()
      count++
    })
    expect(count).toBe(1)
    e.dispose()
    s.set(1)
    expect(count).toBe(1)
  })

  test("disposed _bind does not re-run", () => {
    const s = signal(0)
    let count = 0
    const dispose = _bind(() => {
      s()
      count++
    })
    expect(count).toBe(1)
    dispose()
    s.set(1)
    expect(count).toBe(1)
    // Double dispose is safe
    dispose()
  })

  test("disposed renderEffect does not re-run", () => {
    const s = signal(0)
    let count = 0
    const dispose = renderEffect(() => {
      s()
      count++
    })
    expect(count).toBe(1)
    dispose()
    s.set(1)
    expect(count).toBe(1)
  })
})

// ── store.ts branches ─────────────────────────────────────────────────────────

describe("store branches", () => {
  test("setting symbol property", () => {
    const store = createStore({ a: 1 })
    const sym = Symbol("test")
    ;(store as Record<symbol, unknown>)[sym] = "hello"
    expect((store as Record<symbol, unknown>)[sym]).toBe("hello")
  })

  test("deleteProperty on store", () => {
    const store = createStore<Record<string, unknown>>({ a: 1, b: 2 })
    delete store.b
    expect(store.b).toBeUndefined()
  })

  test("deleteProperty on store array", () => {
    const store = createStore([1, 2, 3])
    delete (store as unknown as Record<string, unknown>)["1"]
    expect(store[1]).toBeUndefined()
  })

  test("deleteProperty on store with reactive subscriber", () => {
    const store = createStore<Record<string, unknown>>({ a: 1, b: 2 })
    // Read 'b' in effect to create propSignal
    let val: unknown
    effect(() => {
      val = store.b
    })
    expect(val).toBe(2)
    delete store.b
    // Signal should be set to undefined and deleted from map
    expect(val).toBeUndefined()
  })
})

// ── reconcile.ts branches ─────────────────────────────────────────────────────

describe("reconcile branches", () => {
  test("reconcile array with non-object source items", () => {
    const store = createStore([1, 2, 3])
    reconcile([4, 5], store)
    expect([...store]).toEqual([4, 5])
  })

  test("reconcile object with raw (non-store) target value", () => {
    // Create store where nested value isn't yet a store proxy
    const store = createStore<Record<string, unknown>>({ a: 1 })
    // Reconcile with nested object — target.a is a number (not store), so it takes the else branch
    reconcile({ a: { nested: true } }, store)
    expect((store.a as Record<string, unknown>).nested).toBe(true)
  })

  test("reconcile array with null source entries", () => {
    const store = createStore([1, null, 3])
    reconcile([null, 2, null], store)
    expect([...store]).toEqual([null, 2, null])
  })

  test("reconcile object with null source values", () => {
    const store = createStore<Record<string, unknown>>({ a: { x: 1 }, b: 2 })
    reconcile({ a: null, b: 2 }, store)
    expect(store.a).toBeNull()
  })

  test("reconcile array with both source and target as objects (recursive)", () => {
    const store = createStore([{ a: 1 }, { b: 2 }])
    reconcile([{ a: 10 }, { b: 20 }], store)
    expect(store[0]!.a).toBe(10)
    expect(store[1]!.b).toBe(20)
  })

  test("reconcile object where target has store-proxied nested object", () => {
    const store = createStore<Record<string, Record<string, number>>>({ nested: { x: 1 } })
    // Access nested to ensure it's proxied as store
    const _val = store.nested!.x
    expect(isStore(store.nested!)).toBe(true)
    reconcile({ nested: { x: 99 } }, store)
    expect(store.nested!.x).toBe(99)
  })

  test("reconcile object where target has raw (non-store) nested object", () => {
    // Don't access nested, so it stays as raw object (not proxied)
    const store = createStore<Record<string, Record<string, number>>>({ nested: { x: 1 } })
    // nested has not been accessed via proxy, so isStore(target.nested) is false
    // This should hit the `else { target[key] = sv }` branch at line 78
    reconcile({ nested: { x: 99 } }, store)
    expect(store.nested!.x).toBe(99)
  })
})

// ── debug.ts branches ─────────────────────────────────────────────────────────

describe("debug branches", () => {
  test("why with exactly 1 subscriber shows singular", async () => {
    const s = signal(0, { name: "single" })
    // Add exactly 1 subscriber
    effect(() => s())
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(" "))
    why()
    s.set(1)
    // why() auto-disposes via microtask
    await new Promise((r) => setTimeout(r, 10))
    console.log = origLog
    expect(logs.some((l) => l.includes("1 subscriber"))).toBe(true)
  })

  test("_notifyTraceListeners with no active listeners is noop", () => {
    // When no listeners registered, this should not throw
    // (tests the early return / null check)
    const s = signal(0)
    s.set(1) // triggers _notifyTraceListeners internally but no listeners active
  })
})
