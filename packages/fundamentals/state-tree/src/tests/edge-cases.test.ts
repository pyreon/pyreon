import { computed, effect } from "@pyreon/reactivity"
import type { Patch } from "../index"
import {
  addMiddleware,
  applyPatch,
  applySnapshot,
  getSnapshot,
  model,
  onPatch,
  resetAllHooks,
} from "../index"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const Profile = model({
  state: { name: "", bio: "" },
  actions: (self) => ({
    rename: (n: string) => self.name.set(n),
    setBio: (b: string) => self.bio.set(b),
  }),
})

const App = model({
  state: { profile: Profile, title: "My App" },
  actions: (self) => ({
    setTitle: (t: string) => self.title.set(t),
    replaceProfile: (p: any) => self.profile.set(p),
  }),
})

const Counter = model({
  state: { count: 0 },
  views: (self) => ({
    doubled: computed(() => self.count() * 2),
  }),
  actions: (self) => ({
    inc: () => self.count.update((c: number) => c + 1),
    add: (n: number) => self.count.update((c: number) => c + n),
    reset: () => self.count.set(0),
  }),
})

// ─── 1. Nested model deletion ────────────────────────────────────────────────

describe("nested model deletion", () => {
  it("replacing a nested child model updates snapshot correctly", () => {
    const Child = model({
      state: { value: 0 },
      actions: (self) => ({
        setValue: (v: number) => self.value.set(v),
      }),
    })

    const Parent = model({
      state: { child: Child, label: "parent" },
      actions: (self) => ({
        replaceChild: (c: any) => self.child.set(c),
        setLabel: (l: string) => self.label.set(l),
      }),
    })

    const parent = Parent.create({
      child: { value: 10 },
      label: "original",
    })

    expect(getSnapshot(parent)).toEqual({
      child: { value: 10 },
      label: "original",
    })

    // Replace child with a new instance
    const newChild = Child.create({ value: 99 })
    parent.replaceChild(newChild)

    // Snapshot should reflect the new child
    expect(getSnapshot(parent)).toEqual({
      child: { value: 99 },
      label: "original",
    })
  })

  it("nested patches stop propagating after child replacement", () => {
    const Child = model({
      state: { x: 0 },
      actions: (self) => ({
        setX: (v: number) => self.x.set(v),
      }),
    })

    const Parent = model({
      state: { child: Child },
      actions: (self) => ({
        replaceChild: (c: any) => self.child.set(c),
      }),
    })

    const parent = Parent.create({ child: { x: 1 } })
    const oldChild = parent.child()

    const patches: Patch[] = []
    onPatch(parent, (p) => patches.push(p))

    // Mutate old child — should propagate
    oldChild.setX(2)
    expect(patches).toHaveLength(1)
    expect(patches[0]).toEqual({ op: "replace", path: "/child/x", value: 2 })

    // Replace child
    const newChild = Child.create({ x: 50 })
    parent.replaceChild(newChild)
    expect(patches).toHaveLength(2)
    expect(patches[1]!.path).toBe("/child")
  })
})

// ─── 2. Snapshot edge cases ──────────────────────────────────────────────────

describe("snapshot edge cases", () => {
  it("handles null values in state", () => {
    const M = model({
      state: { data: null as string | null },
      actions: (self) => ({
        setData: (v: string | null) => self.data.set(v),
      }),
    })

    const m = M.create()
    expect(getSnapshot(m)).toEqual({ data: null })

    m.setData("hello")
    expect(getSnapshot(m)).toEqual({ data: "hello" })

    m.setData(null)
    expect(getSnapshot(m)).toEqual({ data: null })
  })

  it("handles empty arrays in state", () => {
    const M = model({
      state: { items: [] as number[] },
      actions: (self) => ({
        setItems: (v: number[]) => self.items.set(v),
      }),
    })

    const m = M.create()
    expect(getSnapshot(m)).toEqual({ items: [] })

    m.setItems([1, 2, 3])
    expect(getSnapshot(m)).toEqual({ items: [1, 2, 3] })
  })

  it("handles Date objects in state", () => {
    const now = new Date("2025-01-01T00:00:00Z")
    const M = model({
      state: { createdAt: now },
    })

    const m = M.create()
    const snap = getSnapshot(m)
    expect(snap.createdAt).toBeInstanceOf(Date)
    expect((snap.createdAt as Date).toISOString()).toBe("2025-01-01T00:00:00.000Z")
  })

  it("handles undefined initial values by falling back to defaults", () => {
    const M = model({
      state: { x: 10, y: "hello", z: true },
    })

    // Pass undefined for all — should use defaults
    const m = M.create()
    expect(getSnapshot(m)).toEqual({ x: 10, y: "hello", z: true })
  })

  it("handles complex nested objects in state", () => {
    const M = model({
      state: {
        config: { theme: "dark", fontSize: 14, plugins: ["a", "b"] },
      },
      actions: (self) => ({
        setConfig: (c: any) => self.config.set(c),
      }),
    })

    const m = M.create()
    expect(getSnapshot(m)).toEqual({
      config: { theme: "dark", fontSize: 14, plugins: ["a", "b"] },
    })

    m.setConfig({ theme: "light", fontSize: 16, plugins: [] })
    expect(getSnapshot(m)).toEqual({
      config: { theme: "light", fontSize: 16, plugins: [] },
    })
  })
})

// ─── 3. Patch replay ─────────────────────────────────────────────────────────

describe("patch replay", () => {
  it("replaying recorded patches on a fresh instance reproduces final state", () => {
    const M = model({
      state: { a: 0, b: "" },
      actions: (self) => ({
        setA: (v: number) => self.a.set(v),
        setB: (v: string) => self.b.set(v),
      }),
    })

    const original = M.create()
    const patches: Patch[] = []
    onPatch(original, (p) => patches.push({ ...p }))

    original.setA(1)
    original.setB("hello")
    original.setA(2)
    original.setB("world")
    original.setA(42)

    expect(patches).toHaveLength(5)

    // Replay on fresh instance
    const replica = M.create()
    applyPatch(replica, patches)

    expect(getSnapshot(replica)).toEqual(getSnapshot(original))
    expect(replica.a()).toBe(42)
    expect(replica.b()).toBe("world")
  })

  it("replaying patches preserves intermediate state transitions", () => {
    const c = Counter.create()
    const patches: Patch[] = []
    onPatch(c, (p) => patches.push({ ...p }))

    c.inc()
    c.inc()
    c.inc()
    c.add(10)
    c.reset()
    c.add(5)

    // Final state: 5
    const fresh = Counter.create()
    applyPatch(fresh, patches)
    expect(fresh.count()).toBe(5)
  })
})

// ─── 4. Patch with nested operations ─────────────────────────────────────────

describe("patch with nested operations", () => {
  it("applies replace on deeply nested model property", () => {
    const Leaf = model({
      state: { value: 0 },
      actions: (self) => ({
        setValue: (v: number) => self.value.set(v),
      }),
    })

    const Branch = model({
      state: { leaf: Leaf, tag: "" },
      actions: (self) => ({
        setTag: (t: string) => self.tag.set(t),
      }),
    })

    const Root = model({
      state: { branch: Branch, name: "root" },
      actions: (self) => ({
        setName: (n: string) => self.name.set(n),
      }),
    })

    const root = Root.create({
      branch: { leaf: { value: 1 }, tag: "a" },
      name: "root",
    })

    // Apply patch to deeply nested leaf
    applyPatch(root, { op: "replace", path: "/branch/leaf/value", value: 999 })
    expect(root.branch().leaf().value()).toBe(999)

    // Apply patch to intermediate level
    applyPatch(root, { op: "replace", path: "/branch/tag", value: "updated" })
    expect(root.branch().tag()).toBe("updated")

    // Apply patch to top level
    applyPatch(root, { op: "replace", path: "/name", value: "new-root" })
    expect(root.name()).toBe("new-root")
  })

  it("records nested patches with correct paths", () => {
    const app = App.create({
      profile: { name: "Alice", bio: "dev" },
      title: "Test",
    })

    const patches: Patch[] = []
    onPatch(app, (p) => patches.push({ ...p }))

    app.profile().rename("Bob")
    app.profile().setBio("engineer")
    app.setTitle("New Title")

    expect(patches).toEqual([
      { op: "replace", path: "/profile/name", value: "Bob" },
      { op: "replace", path: "/profile/bio", value: "engineer" },
      { op: "replace", path: "/title", value: "New Title" },
    ])
  })

  it("replays nested patches on fresh instance", () => {
    const app = App.create({
      profile: { name: "Alice", bio: "" },
      title: "v1",
    })

    const patches: Patch[] = []
    onPatch(app, (p) => patches.push({ ...p }))

    app.profile().rename("Carol")
    app.setTitle("v2")

    const fresh = App.create({
      profile: { name: "Alice", bio: "" },
      title: "v1",
    })
    applyPatch(fresh, patches)

    expect(fresh.profile().name()).toBe("Carol")
    expect(fresh.title()).toBe("v2")
  })
})

// ─── 5. Middleware error handling ─────────────────────────────────────────────

describe("middleware error handling", () => {
  it("throwing middleware does not corrupt state", () => {
    const c = Counter.create({ count: 5 })

    addMiddleware(c, (_call, _next) => {
      throw new Error("middleware boom")
    })

    expect(() => c.inc()).toThrow("middleware boom")
    // State should remain unchanged since the action never ran
    expect(c.count()).toBe(5)
  })

  it("error in middleware after next() does not undo the action", () => {
    const c = Counter.create({ count: 0 })

    addMiddleware(c, (call, next) => {
      next(call)
      throw new Error("post-action error")
    })

    expect(() => c.inc()).toThrow("post-action error")
    // The action DID run before the error
    expect(c.count()).toBe(1)
  })

  it("error in one middleware prevents subsequent middlewares from running", () => {
    const c = Counter.create()
    const log: string[] = []

    addMiddleware(c, (_call, _next) => {
      log.push("first")
      throw new Error("first fails")
    })

    addMiddleware(c, (call, next) => {
      log.push("second")
      return next(call)
    })

    expect(() => c.inc()).toThrow("first fails")
    // Only the first middleware ran (Koa-style: first wraps second)
    expect(log).toEqual(["first"])
    expect(c.count()).toBe(0)
  })
})

// ─── 6. Middleware chain order ────────────────────────────────────────────────

describe("middleware chain order", () => {
  it("middlewares fire in registration order (Koa-style onion)", () => {
    const c = Counter.create()
    const log: string[] = []

    addMiddleware(c, (call, next) => {
      log.push("A:before")
      const result = next(call)
      log.push("A:after")
      return result
    })

    addMiddleware(c, (call, next) => {
      log.push("B:before")
      const result = next(call)
      log.push("B:after")
      return result
    })

    addMiddleware(c, (call, next) => {
      log.push("C:before")
      const result = next(call)
      log.push("C:after")
      return result
    })

    c.inc()

    expect(log).toEqual(["A:before", "B:before", "C:before", "C:after", "B:after", "A:after"])
  })

  it("middleware can modify action args before passing to next", () => {
    const c = Counter.create()

    addMiddleware(c, (call, next) => {
      // Double the argument to add()
      if (call.name === "add") {
        return next({ ...call, args: [(call.args[0] as number) * 2] })
      }
      return next(call)
    })

    c.add(5)
    expect(c.count()).toBe(10)
  })

  it("middleware can replace action result", () => {
    const M = model({
      state: { value: "" },
      actions: (self) => ({
        getValue: () => {
          return self.value()
        },
        setValue: (v: string) => self.value.set(v),
      }),
    })

    const m = M.create()
    m.setValue("original")

    addMiddleware(m, (call, next) => {
      const result = next(call)
      if (call.name === "getValue") {
        return `intercepted:${result}`
      }
      return result
    })

    expect(m.getValue()).toBe("intercepted:original")
  })
})

// ─── 7. Hook singleton behavior ──────────────────────────────────────────────

describe("hook singleton behavior", () => {
  afterEach(() => resetAllHooks())

  it("asHook returns the same hook function for the same id", () => {
    const useCounter1 = Counter.asHook("singleton-test")
    const useCounter2 = Counter.asHook("singleton-test")

    // The hook functions may be different references but the instance they return is the same
    const instance1 = useCounter1()
    const instance2 = useCounter2()
    expect(instance1).toBe(instance2)
  })

  it("mutations via one hook reference are visible via another", () => {
    const useA = Counter.asHook("shared-hook")
    const useB = Counter.asHook("shared-hook")

    useA().inc()
    useA().inc()

    expect(useB().count()).toBe(2)
    expect(useA().doubled()).toBe(4)
  })

  it("different models with same hook id share the same registry entry", () => {
    // First model claims the id
    const useFirst = Counter.asHook("conflict-id")
    const instance = useFirst()

    // Second model with same id returns the already-created instance (Counter, not Profile)
    const useSecond = Profile.asHook("conflict-id")
    expect(useSecond()).toBe(instance)
  })

  it("resetAllHooks makes subsequent calls create fresh instances", () => {
    const useC = Counter.asHook("fresh-test")
    const old = useC()
    old.add(100)

    resetAllHooks()

    const fresh = useC()
    expect(fresh).not.toBe(old)
    expect(fresh.count()).toBe(0)
  })
})

// ─── 8. Model with no actions ────────────────────────────────────────────────

describe("model with no actions", () => {
  it("creates instance with only state", () => {
    const ReadOnly = model({
      state: { x: 10, y: "hello" },
    })

    const r = ReadOnly.create()
    expect(r.x()).toBe(10)
    expect(r.y()).toBe("hello")
  })

  it("supports views without actions", () => {
    const Derived = model({
      state: { a: 3, b: 4 },
      views: (self) => ({
        sum: computed(() => self.a() + self.b()),
        product: computed(() => self.a() * self.b()),
      }),
    })

    const d = Derived.create()
    expect(d.sum()).toBe(7)
    expect(d.product()).toBe(12)
  })

  it("snapshots work on action-less models", () => {
    const M = model({ state: { val: 42 } })
    const m = M.create({ val: 100 })
    expect(getSnapshot(m)).toEqual({ val: 100 })
  })

  it("applySnapshot works on action-less models", () => {
    const M = model({ state: { val: 0 } })
    const m = M.create()
    applySnapshot(m, { val: 999 })
    expect(m.val()).toBe(999)
  })

  it("onPatch works on action-less models when signals are set directly", () => {
    const M = model({ state: { val: 0 } })
    const m = M.create()
    const patches: Patch[] = []
    onPatch(m, (p) => patches.push(p))

    // Set via tracked signal directly
    m.val.set(5)
    expect(patches).toHaveLength(1)
    expect(patches[0]).toEqual({ op: "replace", path: "/val", value: 5 })
  })

  it("middleware can be added to action-less models (no-op since no actions)", () => {
    const M = model({ state: { val: 0 } })
    const m = M.create()
    const log: string[] = []

    const unsub = addMiddleware(m, (call, next) => {
      log.push(call.name)
      return next(call)
    })

    // No actions to call, so middleware never fires
    m.val.set(10) // Direct signal set bypasses middleware
    expect(log).toHaveLength(0)
    expect(m.val()).toBe(10)

    unsub()
  })
})

// ─── 9. applySnapshot with partial data ──────────────────────────────────────

describe("applySnapshot with partial data", () => {
  it("only updates specified fields, keeps others unchanged", () => {
    const M = model({
      state: { name: "default", age: 0, active: false },
      actions: (self) => ({
        setName: (n: string) => self.name.set(n),
        setAge: (a: number) => self.age.set(a),
      }),
    })

    const m = M.create({ name: "Alice", age: 30, active: true })

    // Only update name
    applySnapshot(m, { name: "Bob" })
    expect(m.name()).toBe("Bob")
    expect(m.age()).toBe(30)
    expect(m.active()).toBe(true)

    // Only update age
    applySnapshot(m, { age: 25 })
    expect(m.name()).toBe("Bob")
    expect(m.age()).toBe(25)
    expect(m.active()).toBe(true)
  })

  it("empty snapshot changes nothing", () => {
    const M = model({ state: { x: 1, y: 2 } })
    const m = M.create()

    applySnapshot(m, {})
    expect(m.x()).toBe(1)
    expect(m.y()).toBe(2)
  })

  it("partial nested snapshot updates only specified nested fields", () => {
    const app = App.create({
      profile: { name: "Alice", bio: "dev" },
      title: "Old",
    })

    // Update only the nested profile name, leave bio unchanged
    applySnapshot(app, { profile: { name: "Bob" } } as any)
    expect(app.profile().name()).toBe("Bob")
    expect(app.profile().bio()).toBe("dev")
    expect(app.title()).toBe("Old")
  })

  it("applySnapshot batches updates — effect fires once", () => {
    const M = model({ state: { a: 0, b: 0, c: 0 } })
    const m = M.create()

    let effectRuns = 0
    effect(() => {
      m.a()
      m.b()
      m.c()
      effectRuns++
    })
    effectRuns = 0

    applySnapshot(m, { a: 1, b: 2, c: 3 })
    expect(effectRuns).toBe(1)
  })
})

// ─── 10. onPatch listener cleanup ────────────────────────────────────────────

describe("onPatch listener cleanup", () => {
  it("unsubscribe prevents further callbacks", () => {
    const c = Counter.create()
    const patches: Patch[] = []
    const unsub = onPatch(c, (p) => patches.push(p))

    c.inc()
    expect(patches).toHaveLength(1)

    unsub()

    c.inc()
    c.inc()
    expect(patches).toHaveLength(1) // No new patches after unsub
  })

  it("multiple listeners can be independently unsubscribed", () => {
    const c = Counter.create()
    const logA: Patch[] = []
    const logB: Patch[] = []

    const unsubA = onPatch(c, (p) => logA.push(p))
    const unsubB = onPatch(c, (p) => logB.push(p))

    c.inc()
    expect(logA).toHaveLength(1)
    expect(logB).toHaveLength(1)

    // Unsub A, B still receives
    unsubA()
    c.inc()
    expect(logA).toHaveLength(1)
    expect(logB).toHaveLength(2)

    // Unsub B
    unsubB()
    c.inc()
    expect(logA).toHaveLength(1)
    expect(logB).toHaveLength(2)
  })

  it("double unsubscribe is safe (no-op)", () => {
    const c = Counter.create()
    const unsub = onPatch(c, () => {})

    unsub()
    expect(() => unsub()).not.toThrow()
  })

  it("listener added after unsub receives only new patches", () => {
    const c = Counter.create()
    const log1: Patch[] = []
    const log2: Patch[] = []

    const unsub1 = onPatch(c, (p) => log1.push(p))
    c.inc() // log1: 1 patch

    unsub1()
    c.inc() // No listener

    onPatch(c, (p) => log2.push(p))
    c.inc() // log2: 1 patch

    expect(log1).toHaveLength(1)
    expect(log2).toHaveLength(1)
    expect(log1[0]!.value).toBe(1) // First inc
    expect(log2[0]!.value).toBe(3) // Third inc
  })
})
