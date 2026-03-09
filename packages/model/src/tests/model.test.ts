import { describe, it, expect } from "bun:test"
import { computed, effect } from "@pyreon/reactivity"
import type { Patch } from "../index"
import { model, getSnapshot, applySnapshot, onPatch, addMiddleware } from "../index"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const Counter = model({
  state: { count: 0 },
  views: (self) => ({
    doubled:    computed(() => self.count() * 2),
    isPositive: computed(() => self.count() > 0),
  }),
  actions: (self) => ({
    inc:   () => self.count.update((c: number) => c + 1),
    dec:   () => self.count.update((c: number) => c - 1),
    add:   (n: number) => self.count.update((c: number) => c + n),
    reset: () => self.count.set(0),
  }),
})

const Profile = model({
  state: { name: "", bio: "" },
  actions: (self) => ({
    rename:  (n: string) => self.name.set(n),
    setBio:  (b: string) => self.bio.set(b),
  }),
})

const App = model({
  state: { profile: Profile, title: "My App" },
  actions: (self) => ({
    setTitle: (t: string) => self.title.set(t),
  }),
})

// ─── State signals ─────────────────────────────────────────────────────────────

describe("state signals", () => {
  it("create() returns instance with callable signals", () => {
    const c = Counter.create()
    expect(typeof c.count).toBe("function")
    expect(c.count()).toBe(0)
  })

  it("uses defaults when no initial value supplied", () => {
    const c = Counter.create()
    expect(c.count()).toBe(0)
  })

  it("overrides defaults with supplied initial values", () => {
    const c = Counter.create({ count: 42 })
    expect(c.count()).toBe(42)
  })

  it("partial initial — unspecified keys use defaults", () => {
    const NamedCounter = model({ state: { count: 0, label: "default" } })
    const c = NamedCounter.create({ count: 10 })
    expect(c.count()).toBe(10)
    expect(c.label()).toBe("default")
  })
})

// ─── Actions ──────────────────────────────────────────────────────────────────

describe("actions", () => {
  it("actions update state signals", () => {
    const c = Counter.create()
    c.inc()
    expect(c.count()).toBe(1)
  })

  it("actions with arguments work correctly", () => {
    const c = Counter.create()
    c.add(5)
    expect(c.count()).toBe(5)
  })

  it("self closure allows reading current signal values", () => {
    const c = Counter.create({ count: 3 })
    c.inc()
    c.inc()
    expect(c.count()).toBe(5)
  })

  it("actions can call other actions via self (Proxy)", () => {
    const M = model({
      state: { x: 0 },
      actions: (self) => ({
        doubleInc: () => { self.inc(); self.inc() },
        inc: () => self.x.update((n: number) => n + 1),
      }),
    })
    const m = M.create()
    m.doubleInc()
    expect(m.x()).toBe(2)
  })
})

// ─── Views ────────────────────────────────────────────────────────────────────

describe("views", () => {
  it("views return computed signals", () => {
    const c = Counter.create({ count: 5 })
    expect(c.doubled()).toBe(10)
  })

  it("views recompute when state changes", () => {
    const c = Counter.create({ count: 3 })
    expect(c.doubled()).toBe(6)
    c.inc()
    expect(c.doubled()).toBe(8)
  })

  it("views are reactive in effects", () => {
    const c = Counter.create()
    const observed: boolean[] = []
    effect(() => { observed.push(c.isPositive()) })
    c.inc()
    c.dec()
    expect(observed).toEqual([false, true, false])
  })
})

// ─── asHook ───────────────────────────────────────────────────────────────────

describe("asHook", () => {
  it("returns the same instance for the same id", () => {
    const useC = Counter.asHook("hook-test")
    expect(useC()).toBe(useC())
  })

  it("different ids give independent instances", () => {
    const useA = Counter.asHook("hook-a")
    const useB = Counter.asHook("hook-b")
    useA().inc()
    expect(useA().count()).toBe(1)
    expect(useB().count()).toBe(0)
  })
})

// ─── getSnapshot ──────────────────────────────────────────────────────────────

describe("getSnapshot", () => {
  it("returns a plain JS object", () => {
    const c = Counter.create({ count: 7 })
    const snap = getSnapshot(c)
    expect(snap).toEqual({ count: 7 })
    expect(typeof snap.count).toBe("number")
  })

  it("snapshot reflects current state after mutations", () => {
    const c = Counter.create()
    c.inc(); c.inc(); c.inc()
    expect(getSnapshot(c)).toEqual({ count: 3 })
  })

  it("throws for non-model-instance values", () => {
    expect(() => getSnapshot({} as object)).toThrow("[@pyreon/model]")
  })
})

// ─── applySnapshot ────────────────────────────────────────────────────────────

describe("applySnapshot", () => {
  it("restores state from a plain snapshot", () => {
    const c = Counter.create({ count: 10 })
    applySnapshot(c, { count: 0 })
    expect(c.count()).toBe(0)
  })

  it("partial snapshot — only specified keys are updated", () => {
    const NamedCounter = model({ state: { count: 0, label: "x" } })
    const c = NamedCounter.create({ count: 5, label: "hello" })
    applySnapshot(c, { count: 99 })
    expect(c.count()).toBe(99)
    expect(c.label()).toBe("hello")
  })

  it("batch: effects fire once even for multi-field updates", () => {
    const M = model({ state: { a: 0, b: 0 } })
    const m = M.create()
    let effectRuns = 0
    effect(() => { m.a(); m.b(); effectRuns++ })
    effectRuns = 0
    applySnapshot(m, { a: 1, b: 2 })
    expect(effectRuns).toBe(1)
    expect(m.a()).toBe(1)
    expect(m.b()).toBe(2)
  })
})

// ─── onPatch ──────────────────────────────────────────────────────────────────

describe("onPatch", () => {
  it("fires when a signal is written", () => {
    const c = Counter.create()
    const patches: Patch[] = []
    onPatch(c, (p) => patches.push(p))
    c.inc()
    expect(patches).toHaveLength(1)
    expect(patches[0]).toEqual({ op: "replace", path: "/count", value: 1 })
  })

  it("does NOT fire when value is unchanged", () => {
    const c = Counter.create()
    const patches: Patch[] = []
    onPatch(c, (p) => patches.push(p))
    c.count.set(0)  // same value
    expect(patches).toHaveLength(0)
  })

  it("unsub stops patch events", () => {
    const c = Counter.create()
    const patches: Patch[] = []
    const unsub = onPatch(c, (p) => patches.push(p))
    unsub()
    c.inc()
    expect(patches).toHaveLength(0)
  })

  it("includes correct value in patch", () => {
    const c = Counter.create()
    const values: number[] = []
    onPatch(c, (p) => values.push(p.value as number))
    c.add(3)
    c.add(7)
    expect(values).toEqual([3, 10])
  })
})

// ─── addMiddleware ────────────────────────────────────────────────────────────

describe("addMiddleware", () => {
  it("intercepts action calls", () => {
    const c = Counter.create()
    const intercepted: string[] = []
    addMiddleware(c, (call, next) => { intercepted.push(call.name); return next(call) })
    c.inc()
    expect(intercepted).toContain("inc")
  })

  it("next() executes the action", () => {
    const c = Counter.create()
    addMiddleware(c, (call, next) => next(call))
    c.add(5)
    expect(c.count()).toBe(5)
  })

  it("middleware can prevent action from running by not calling next", () => {
    const c = Counter.create()
    addMiddleware(c, (_call, _next) => { /* block */ })
    c.inc()
    expect(c.count()).toBe(0)
  })

  it("multiple middlewares run in registration order", () => {
    const c = Counter.create()
    const log: string[] = []
    addMiddleware(c, (call, next) => { log.push("A"); next(call); log.push("A'") })
    addMiddleware(c, (call, next) => { log.push("B"); next(call); log.push("B'") })
    c.inc()
    // Koa-style: A→B→action→B'→A' (inner middleware unwraps first)
    expect(log).toEqual(["A", "B", "B'", "A'"])
  })

  it("unsub removes the middleware", () => {
    const c = Counter.create()
    const log: string[] = []
    const unsub = addMiddleware(c, (call, next) => { log.push(call.name); return next(call) })
    unsub()
    c.inc()
    expect(log).toHaveLength(0)
  })
})

// ─── Nested models ────────────────────────────────────────────────────────────

describe("nested models", () => {
  it("creates nested instance from snapshot", () => {
    const app = App.create({ profile: { name: "Alice", bio: "dev" }, title: "App" })
    expect(app.profile().name()).toBe("Alice")
  })

  it("nested instance has its own actions", () => {
    const app = App.create({ profile: { name: "Alice", bio: "" }, title: "App" })
    app.profile().rename("Bob")
    expect(app.profile().name()).toBe("Bob")
  })

  it("nested defaults used when no snapshot provided", () => {
    const app = App.create()
    expect(app.profile().name()).toBe("")
    expect(app.title()).toBe("My App")
  })

  it("getSnapshot recursively serializes nested instances", () => {
    const app = App.create({ profile: { name: "Alice", bio: "dev" }, title: "Hello" })
    const snap = getSnapshot(app)
    expect(snap).toEqual({ profile: { name: "Alice", bio: "dev" }, title: "Hello" })
  })

  it("onPatch emits nested path for nested state change", () => {
    const app = App.create({ profile: { name: "Alice", bio: "" }, title: "" })
    const patches: Patch[] = []
    onPatch(app, (p) => patches.push(p))
    app.profile().rename("Bob")
    expect(patches).toHaveLength(1)
    expect(patches[0]).toEqual({ op: "replace", path: "/profile/name", value: "Bob" })
  })

  it("applySnapshot restores nested state", () => {
    const app = App.create({ profile: { name: "Alice", bio: "" }, title: "old" })
    applySnapshot(app, { profile: { name: "Carol", bio: "new" }, title: "new" })
    expect(app.profile().name()).toBe("Carol")
    expect(app.title()).toBe("new")
  })
})
