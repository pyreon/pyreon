import { computed, effect } from "@pyreon/reactivity";
import type { Patch } from "../index";
import {
  addMiddleware,
  applyPatch,
  applySnapshot,
  getSnapshot,
  model,
  onPatch,
  resetAllHooks,
  resetHook,
} from "../index";
import { instanceMeta } from "../registry";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const Counter = model({
  state: { count: 0 },
  views: (self) => ({
    doubled: computed(() => self.count() * 2),
    isPositive: computed(() => self.count() > 0),
  }),
  actions: (self) => ({
    inc: () => self.count.update((c: number) => c + 1),
    dec: () => self.count.update((c: number) => c - 1),
    add: (n: number) => self.count.update((c: number) => c + n),
    reset: () => self.count.set(0),
  }),
});

const Profile = model({
  state: { name: "", bio: "" },
  actions: (self) => ({
    rename: (n: string) => self.name.set(n),
    setBio: (b: string) => self.bio.set(b),
  }),
});

const App = model({
  state: { profile: Profile, title: "My App" },
  actions: (self) => ({
    setTitle: (t: string) => self.title.set(t),
  }),
});

// ─── State signals ─────────────────────────────────────────────────────────────

describe("state signals", () => {
  it("create() returns instance with callable signals", () => {
    const c = Counter.create();
    expect(typeof c.count).toBe("function");
    expect(c.count()).toBe(0);
  });

  it("uses defaults when no initial value supplied", () => {
    const c = Counter.create();
    expect(c.count()).toBe(0);
  });

  it("overrides defaults with supplied initial values", () => {
    const c = Counter.create({ count: 42 });
    expect(c.count()).toBe(42);
  });

  it("partial initial — unspecified keys use defaults", () => {
    const NamedCounter = model({ state: { count: 0, label: "default" } });
    const c = NamedCounter.create({ count: 10 });
    expect(c.count()).toBe(10);
    expect(c.label()).toBe("default");
  });
});

// ─── Actions ──────────────────────────────────────────────────────────────────

describe("actions", () => {
  it("actions update state signals", () => {
    const c = Counter.create();
    c.inc();
    expect(c.count()).toBe(1);
  });

  it("actions with arguments work correctly", () => {
    const c = Counter.create();
    c.add(5);
    expect(c.count()).toBe(5);
  });

  it("self closure allows reading current signal values", () => {
    const c = Counter.create({ count: 3 });
    c.inc();
    c.inc();
    expect(c.count()).toBe(5);
  });

  it("actions can call other actions via self (Proxy)", () => {
    const M = model({
      state: { x: 0 },
      actions: (self) => ({
        doubleInc: () => {
          self.inc();
          self.inc();
        },
        inc: () => self.x.update((n: number) => n + 1),
      }),
    });
    const m = M.create();
    m.doubleInc();
    expect(m.x()).toBe(2);
  });
});

// ─── Views ────────────────────────────────────────────────────────────────────

describe("views", () => {
  it("views return computed signals", () => {
    const c = Counter.create({ count: 5 });
    expect(c.doubled()).toBe(10);
  });

  it("views recompute when state changes", () => {
    const c = Counter.create({ count: 3 });
    expect(c.doubled()).toBe(6);
    c.inc();
    expect(c.doubled()).toBe(8);
  });

  it("views are reactive in effects", () => {
    const c = Counter.create();
    const observed: boolean[] = [];
    effect(() => {
      observed.push(c.isPositive());
    });
    c.inc();
    c.dec();
    expect(observed).toEqual([false, true, false]);
  });
});

// ─── asHook ───────────────────────────────────────────────────────────────────

describe("asHook", () => {
  afterEach(() => resetAllHooks());

  it("returns the same instance for the same id", () => {
    const useC = Counter.asHook("hook-test");
    expect(useC()).toBe(useC());
  });

  it("different ids give independent instances", () => {
    const useA = Counter.asHook("hook-a");
    const useB = Counter.asHook("hook-b");
    useA().inc();
    expect(useA().count()).toBe(1);
    expect(useB().count()).toBe(0);
  });

  it("resetHook clears a singleton so next call creates fresh instance", () => {
    const useC = Counter.asHook("hook-reset");
    useC().add(10);
    expect(useC().count()).toBe(10);

    resetHook("hook-reset");
    expect(useC().count()).toBe(0);
  });

  it("resetAllHooks clears all singletons", () => {
    const useA = Counter.asHook("hook-all-a");
    const useB = Counter.asHook("hook-all-b");
    useA().inc();
    useB().add(5);

    resetAllHooks();
    expect(useA().count()).toBe(0);
    expect(useB().count()).toBe(0);
  });

  it("resetHook on non-existent id is a no-op", () => {
    expect(() => resetHook("no-such-hook")).not.toThrow();
  });
});

// ─── Error guards ────────────────────────────────────────────────────────────

describe("error guards", () => {
  it("onPatch throws for non-model-instance", () => {
    expect(() =>
      onPatch({} as object, () => {
        /* noop */
      }),
    ).toThrow("[@pyreon/state-tree]");
  });

  it("addMiddleware throws for non-model-instance", () => {
    expect(() => addMiddleware({} as object, (_c, n) => n(_c))).toThrow("[@pyreon/state-tree]");
  });

  it("applySnapshot throws for non-model-instance", () => {
    expect(() => applySnapshot({} as object, {})).toThrow("[@pyreon/state-tree]");
  });
});

// ─── getSnapshot ──────────────────────────────────────────────────────────────

describe("getSnapshot", () => {
  it("returns a plain JS object", () => {
    const c = Counter.create({ count: 7 });
    const snap = getSnapshot(c);
    expect(snap).toEqual({ count: 7 });
    expect(typeof snap.count).toBe("number");
  });

  it("snapshot reflects current state after mutations", () => {
    const c = Counter.create();
    c.inc();
    c.inc();
    c.inc();
    expect(getSnapshot(c)).toEqual({ count: 3 });
  });

  it("throws for non-model-instance values", () => {
    expect(() => getSnapshot({} as object)).toThrow("[@pyreon/state-tree]");
  });
});

// ─── applySnapshot ────────────────────────────────────────────────────────────

describe("applySnapshot", () => {
  it("restores state from a plain snapshot", () => {
    const c = Counter.create({ count: 10 });
    applySnapshot(c, { count: 0 });
    expect(c.count()).toBe(0);
  });

  it("partial snapshot — only specified keys are updated", () => {
    const NamedCounter = model({ state: { count: 0, label: "x" } });
    const c = NamedCounter.create({ count: 5, label: "hello" });
    applySnapshot(c, { count: 99 });
    expect(c.count()).toBe(99);
    expect(c.label()).toBe("hello");
  });

  it("batch: effects fire once even for multi-field updates", () => {
    const M = model({ state: { a: 0, b: 0 } });
    const m = M.create();
    let effectRuns = 0;
    effect(() => {
      m.a();
      m.b();
      effectRuns++;
    });
    effectRuns = 0;
    applySnapshot(m, { a: 1, b: 2 });
    expect(effectRuns).toBe(1);
    expect(m.a()).toBe(1);
    expect(m.b()).toBe(2);
  });
});

// ─── onPatch ──────────────────────────────────────────────────────────────────

describe("onPatch", () => {
  it("fires when a signal is written", () => {
    const c = Counter.create();
    const patches: Patch[] = [];
    onPatch(c, (p) => patches.push(p));
    c.inc();
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ op: "replace", path: "/count", value: 1 });
  });

  it("does NOT fire when value is unchanged", () => {
    const c = Counter.create();
    const patches: Patch[] = [];
    onPatch(c, (p) => patches.push(p));
    c.count.set(0); // same value
    expect(patches).toHaveLength(0);
  });

  it("unsub stops patch events", () => {
    const c = Counter.create();
    const patches: Patch[] = [];
    const unsub = onPatch(c, (p) => patches.push(p));
    unsub();
    c.inc();
    expect(patches).toHaveLength(0);
  });

  it("includes correct value in patch", () => {
    const c = Counter.create();
    const values: number[] = [];
    onPatch(c, (p) => values.push(p.value as number));
    c.add(3);
    c.add(7);
    expect(values).toEqual([3, 10]);
  });
});

// ─── addMiddleware ────────────────────────────────────────────────────────────

describe("addMiddleware", () => {
  it("intercepts action calls", () => {
    const c = Counter.create();
    const intercepted: string[] = [];
    addMiddleware(c, (call, next) => {
      intercepted.push(call.name);
      return next(call);
    });
    c.inc();
    expect(intercepted).toContain("inc");
  });

  it("next() executes the action", () => {
    const c = Counter.create();
    addMiddleware(c, (call, next) => next(call));
    c.add(5);
    expect(c.count()).toBe(5);
  });

  it("middleware can prevent action from running by not calling next", () => {
    const c = Counter.create();
    addMiddleware(c, (_call, _next) => {
      /* block */
    });
    c.inc();
    expect(c.count()).toBe(0);
  });

  it("multiple middlewares run in registration order", () => {
    const c = Counter.create();
    const log: string[] = [];
    addMiddleware(c, (call, next) => {
      log.push("A");
      next(call);
      log.push("A'");
    });
    addMiddleware(c, (call, next) => {
      log.push("B");
      next(call);
      log.push("B'");
    });
    c.inc();
    // Koa-style: A→B→action→B'→A' (inner middleware unwraps first)
    expect(log).toEqual(["A", "B", "B'", "A'"]);
  });

  it("unsub removes the middleware", () => {
    const c = Counter.create();
    const log: string[] = [];
    const unsub = addMiddleware(c, (call, next) => {
      log.push(call.name);
      return next(call);
    });
    unsub();
    c.inc();
    expect(log).toHaveLength(0);
  });
});

// ─── patch.ts trackedSignal coverage ─────────────────────────────────────────

describe("trackedSignal extra paths", () => {
  it("subscribe on a state signal works (trackedSignal.subscribe)", () => {
    const c = Counter.create();
    const calls: number[] = [];
    const unsub = c.count.subscribe(() => {
      calls.push(c.count());
    });
    c.inc();
    expect(calls).toContain(1);
    unsub();
    c.inc();
    // After unsub, no more notifications
    expect(calls).toHaveLength(1);
  });

  it("update on a state signal uses the updater function (trackedSignal.update)", () => {
    const c = Counter.create({ count: 5 });
    c.count.update((n: number) => n * 2);
    expect(c.count()).toBe(10);
  });

  it("peek on a state signal reads without tracking (trackedSignal.peek)", () => {
    const c = Counter.create({ count: 42 });
    expect(c.count.peek()).toBe(42);
  });
});

// ─── patch.ts snapshotValue coverage ─────────────────────────────────────────

describe("patch snapshotValue", () => {
  it("emits a snapshot (not a live instance) when setting a nested model signal", () => {
    // When a nested model instance is set as a value and a patch listener is active,
    // snapshotValue should recursively serialize the nested model.
    const Inner = model({
      state: { x: 10, y: 20 },
      actions: (self) => ({
        setX: (v: number) => self.x.set(v),
      }),
    });

    const Outer = model({
      state: { child: Inner, label: "hi" },
      actions: (self) => ({
        replaceChild: (newChild: any) => self.child.set(newChild),
      }),
    });

    const outer = Outer.create();
    const patches: Patch[] = [];
    onPatch(outer, (p) => patches.push(p));

    // Create a new inner instance and set it — triggers snapshotValue on a model instance
    const newInner = Inner.create({ x: 99, y: 42 });
    outer.replaceChild(newInner);

    expect(patches).toHaveLength(1);
    expect(patches[0]!.op).toBe("replace");
    expect(patches[0]!.path).toBe("/child");
    // The value should be a plain snapshot, not the live model instance
    expect(patches[0]!.value).toEqual({ x: 99, y: 42 });
    expect(patches[0]!.value).not.toBe(newInner);
  });

  it("snapshotValue recursively serializes deeply nested model instances", () => {
    const Leaf = model({
      state: { val: 0 },
    });
    const Mid = model({
      state: { leaf: Leaf, tag: "mid" },
    });
    const Root = model({
      state: { mid: Mid, name: "root" },
      actions: (self) => ({
        replaceMid: (m: any) => self.mid.set(m),
      }),
    });

    const root = Root.create();
    const patches: Patch[] = [];
    onPatch(root, (p) => patches.push(p));

    const newMid = Mid.create({ leaf: { val: 77 }, tag: "new" });
    root.replaceMid(newMid);

    expect(patches[0]!.value).toEqual({ leaf: { val: 77 }, tag: "new" });
  });

  it("snapshotValue returns the object as-is when it has no meta (!meta branch)", () => {
    // To trigger the !meta branch in snapshotValue, we need isModelInstance to return true
    // for an object that has no actual meta. We do this by temporarily registering a
    // fake object in instanceMeta, making it pass isModelInstance, then deleting the meta
    // before the snapshot is taken... Actually, we can register a fake object in instanceMeta
    // to make isModelInstance true, then set it as a signal value.
    //
    // Simpler: register an object in instanceMeta with stateKeys pointing to missing props.
    const Inner = model({
      state: { x: 10 },
    });

    const Outer = model({
      state: { child: Inner },
      actions: (self) => ({
        replaceChild: (c: any) => self.child.set(c),
      }),
    });

    const outer = Outer.create();
    const patches: Patch[] = [];
    onPatch(outer, (p) => patches.push(p));

    // Create a fake "model instance" — register in instanceMeta so isModelInstance returns true,
    // but with stateKeys that reference properties that don't exist on the object (!sig branch)
    const fakeInstance = {} as any;
    instanceMeta.set(fakeInstance, {
      stateKeys: ["missing"],
      patchListeners: new Set(),
      middlewares: [],
      emitPatch: () => {
        /* noop */
      },
    });

    outer.replaceChild(fakeInstance);
    // snapshotValue is called, meta exists, iterates stateKeys ["missing"],
    // sig = fakeInstance["missing"] = undefined → !sig → continue → returns {}
    expect(patches[0]!.value).toEqual({});
  });

  it("snapshotValue handles stateKey with nested model value recursively in patches", () => {
    // Ensure the recursive path in snapshotValue is covered:
    // when a stateKey's peek() returns a model instance, it recurses.
    const Leaf = model({ state: { v: 1 } });
    const Branch = model({
      state: { leaf: Leaf, tag: "a" },
    });
    const Root = model({
      state: { branch: Branch },
      actions: (self) => ({
        replaceBranch: (b: any) => self.branch.set(b),
      }),
    });

    const root = Root.create();
    const patches: Patch[] = [];
    onPatch(root, (p) => patches.push(p));

    const newBranch = Branch.create({ leaf: { v: 99 }, tag: "b" });
    root.replaceBranch(newBranch);

    expect(patches[0]!.value).toEqual({ leaf: { v: 99 }, tag: "b" });
  });
});

// ─── middleware.ts edge cases ────────────────────────────────────────────────

describe("middleware edge cases", () => {
  it("action runs directly when middleware array is empty (idx >= length branch)", () => {
    const c = Counter.create();
    // No middleware added — dispatch(0, call) hits idx >= meta.middlewares.length immediately
    c.inc();
    expect(c.count()).toBe(1);
  });

  it("skips falsy middleware entries (!mw branch)", () => {
    const c = Counter.create();
    // Add a real middleware so the array is non-empty
    addMiddleware(c, (call, next) => next(call));
    // Inject a falsy entry at the beginning of the middlewares array
    const meta = instanceMeta.get(c)!;
    meta.middlewares.unshift(undefined as any);
    // Action should still run — the !mw guard falls through to fn(...c.args)
    c.inc();
    expect(c.count()).toBe(1);
  });

  it("double-unsub is a no-op (indexOf returns -1 branch)", () => {
    const c = Counter.create();
    const unsub = addMiddleware(c, (call, next) => next(call));
    unsub();
    // Second unsub — middleware already removed, indexOf returns -1
    expect(() => unsub()).not.toThrow();
  });
});

// ─── snapshot.ts edge cases ──────────────────────────────────────────────────

describe("snapshot edge cases", () => {
  it("getSnapshot skips keys whose signal does not exist (!sig branch)", () => {
    // Create an instance then tamper with it to have a missing signal for a state key
    const c = Counter.create({ count: 5 });
    // Delete the signal to simulate the !sig branch
    delete (c as any).count;
    const snap = getSnapshot(c);
    // The key should be skipped — snapshot is empty
    expect(snap).toEqual({});
  });

  it("applySnapshot skips keys not present in the snapshot object", () => {
    const M = model({ state: { a: 1, b: 2, c: 3 } });
    const m = M.create({ a: 10, b: 20, c: 30 });
    // Only apply 'b' — 'a' and 'c' should remain unchanged
    applySnapshot(m, { b: 99 });
    expect(m.a()).toBe(10);
    expect(m.b()).toBe(99);
    expect(m.c()).toBe(30);
  });

  it("applySnapshot skips keys whose signal does not exist (!sig branch)", () => {
    const c = Counter.create({ count: 5 });
    // Delete the signal to simulate the !sig branch in applySnapshot
    delete (c as any).count;
    // Should not throw — just skip the key
    expect(() => applySnapshot(c, { count: 0 })).not.toThrow();
  });
});

// ─── Nested models ────────────────────────────────────────────────────────────

describe("nested models", () => {
  it("creates nested instance from snapshot", () => {
    const app = App.create({
      profile: { name: "Alice", bio: "dev" },
      title: "App",
    });
    expect(app.profile().name()).toBe("Alice");
  });

  it("nested instance has its own actions", () => {
    const app = App.create({
      profile: { name: "Alice", bio: "" },
      title: "App",
    });
    app.profile().rename("Bob");
    expect(app.profile().name()).toBe("Bob");
  });

  it("nested defaults used when no snapshot provided", () => {
    const app = App.create();
    expect(app.profile().name()).toBe("");
    expect(app.title()).toBe("My App");
  });

  it("getSnapshot recursively serializes nested instances", () => {
    const app = App.create({
      profile: { name: "Alice", bio: "dev" },
      title: "Hello",
    });
    const snap = getSnapshot(app);
    expect(snap).toEqual({
      profile: { name: "Alice", bio: "dev" },
      title: "Hello",
    });
  });

  it("onPatch emits nested path for nested state change", () => {
    const app = App.create({ profile: { name: "Alice", bio: "" }, title: "" });
    const patches: Patch[] = [];
    onPatch(app, (p) => patches.push(p));
    app.profile().rename("Bob");
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      op: "replace",
      path: "/profile/name",
      value: "Bob",
    });
  });

  it("applySnapshot restores nested state", () => {
    const app = App.create({
      profile: { name: "Alice", bio: "" },
      title: "old",
    });
    applySnapshot(app, { profile: { name: "Carol", bio: "new" }, title: "new" });
    expect(app.profile().name()).toBe("Carol");
    expect(app.title()).toBe("new");
  });
});

// ─── applyPatch ──────────────────────────────────────────────────────────────

describe("applyPatch", () => {
  it("applies a single replace patch", () => {
    const c = Counter.create({ count: 0 });
    applyPatch(c, { op: "replace", path: "/count", value: 42 });
    expect(c.count()).toBe(42);
  });

  it("applies an array of patches", () => {
    const c = Counter.create({ count: 0 });
    applyPatch(c, [
      { op: "replace", path: "/count", value: 1 },
      { op: "replace", path: "/count", value: 2 },
      { op: "replace", path: "/count", value: 3 },
    ]);
    expect(c.count()).toBe(3);
  });

  it("applies patch to nested model instance", () => {
    const app = App.create({
      profile: { name: "Alice", bio: "" },
      title: "old",
    });
    applyPatch(app, { op: "replace", path: "/profile/name", value: "Bob" });
    expect(app.profile().name()).toBe("Bob");
  });

  it("roundtrips with onPatch — record and replay", () => {
    const c = Counter.create({ count: 0 });
    const patches: Patch[] = [];
    onPatch(c, (p) => patches.push({ ...p }));

    c.inc();
    c.inc();
    c.add(10);
    expect(c.count()).toBe(12);
    expect(patches).toHaveLength(3);
    // Verify patches contain the final values at each step
    expect(patches[0]).toEqual({ op: "replace", path: "/count", value: 1 });
    expect(patches[1]).toEqual({ op: "replace", path: "/count", value: 2 });
    expect(patches[2]).toEqual({ op: "replace", path: "/count", value: 12 });

    // Replay on a fresh instance
    const c2 = Counter.create({ count: 0 });
    applyPatch(c2, patches);
    expect(c2.count()).toBe(12);
  });

  it("throws for non-model instance", () => {
    expect(() => applyPatch({}, { op: "replace", path: "/x", value: 1 })).toThrow(
      "not a model instance",
    );
  });

  it("throws for empty path", () => {
    const c = Counter.create({ count: 0 });
    expect(() => applyPatch(c, { op: "replace", path: "", value: 1 })).toThrow("empty path");
  });

  it("throws for unknown state key", () => {
    const c = Counter.create({ count: 0 });
    expect(() => applyPatch(c, { op: "replace", path: "/nonexistent", value: 1 })).toThrow(
      "unknown state key",
    );
  });

  it("throws for unsupported op", () => {
    const c = Counter.create({ count: 0 });
    expect(() => applyPatch(c, { op: "add" as any, path: "/count", value: 1 })).toThrow(
      'unsupported op "add"',
    );
  });
});
