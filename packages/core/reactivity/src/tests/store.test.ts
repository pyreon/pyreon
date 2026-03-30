import { effect } from "../effect";
import { reconcile } from "../reconcile";
import { createStore, isStore } from "../store";

describe("createStore", () => {
  test("reads primitive properties reactively", () => {
    const state = createStore({ count: 0 });
    const calls: number[] = [];
    effect(() => {
      calls.push(state.count);
    });
    expect(calls).toEqual([0]);
    state.count = 1;
    expect(calls).toEqual([0, 1]);
    state.count = 1; // no-op (same value)
    expect(calls).toEqual([0, 1]);
  });

  test("deep reactive — nested object", () => {
    const state = createStore({ user: { name: "Alice", age: 30 } });
    const names: string[] = [];
    effect(() => {
      names.push(state.user.name);
    });
    expect(names).toEqual(["Alice"]);
    state.user.name = "Bob";
    expect(names).toEqual(["Alice", "Bob"]);
  });

  test("deep reactive — nested change does NOT re-run parent-only effects", () => {
    const state = createStore({ user: { name: "Alice", age: 30 } });
    const userCalls: number[] = [];
    const nameCalls: string[] = [];
    effect(() => {
      userCalls.push(1);
      void state.user;
    }); // tracks user object
    effect(() => {
      nameCalls.push(state.user.name);
    }); // tracks name only
    expect(userCalls.length).toBe(1);
    state.user.age = 31;
    // Only the age signal fires — user object didn't change, name didn't change
    expect(nameCalls).toEqual(["Alice"]); // name effect didn't re-run
  });

  test("array — tracks length on push", () => {
    const state = createStore({ items: [1, 2, 3] });
    const lengths: number[] = [];
    effect(() => {
      lengths.push(state.items.length);
    });
    expect(lengths).toEqual([3]);
    state.items.push(4);
    expect(lengths).toEqual([3, 4]);
  });

  test("array — tracks index access", () => {
    const state = createStore({ items: ["a", "b"] });
    const values: string[] = [];
    effect(() => {
      values.push(state.items[0] as string);
    });
    expect(values).toEqual(["a"]);
    state.items[0] = "x";
    expect(values).toEqual(["a", "x"]);
    state.items[1] = "y"; // different index — should not re-run this effect
    expect(values).toEqual(["a", "x"]);
  });

  test("isStore identifies proxy", () => {
    const raw = { x: 1 };
    const store = createStore(raw);
    expect(isStore(store)).toBe(true);
    expect(isStore(raw)).toBe(false);
    expect(isStore(null)).toBe(false);
    expect(isStore(42)).toBe(false);
  });

  test("same raw object returns same proxy", () => {
    const raw = { a: 1 };
    const s1 = createStore(raw);
    const s2 = createStore(raw);
    expect(s1).toBe(s2);
  });

  test("deep nested object mutations trigger fine-grained updates", () => {
    const state = createStore({
      a: { b: { c: { d: 1 } } },
    });
    const dValues: number[] = [];
    effect(() => {
      dValues.push(state.a.b.c.d);
    });
    expect(dValues).toEqual([1]);
    state.a.b.c.d = 2;
    expect(dValues).toEqual([1, 2]);
  });

  test("replacing a nested object triggers dependent effects", () => {
    const state = createStore({ user: { name: "Alice", address: { city: "NYC" } } });
    const cities: string[] = [];
    effect(() => {
      cities.push(state.user.address.city);
    });
    expect(cities).toEqual(["NYC"]);
    // Replace the address object entirely
    state.user.address = { city: "LA" };
    expect(cities).toEqual(["NYC", "LA"]);
  });

  test("array splice triggers length and index updates", () => {
    const state = createStore({ items: ["a", "b", "c", "d"] });
    const lengths: number[] = [];
    effect(() => {
      lengths.push(state.items.length);
    });
    expect(lengths).toEqual([4]);
    state.items.splice(1, 2); // removes "b", "c"
    expect(lengths).toEqual([4, 2]);
    expect([...state.items]).toEqual(["a", "d"]);
  });

  test("array pop triggers length update", () => {
    const state = createStore({ items: [1, 2, 3] });
    const lengths: number[] = [];
    effect(() => {
      lengths.push(state.items.length);
    });
    expect(lengths).toEqual([3]);
    state.items.pop();
    expect(lengths).toEqual([3, 2]);
  });

  test("delete property triggers reactivity", () => {
    const state = createStore({ a: 1, b: 2 } as Record<string, number | undefined>);
    const bValues: (number | undefined)[] = [];
    effect(() => {
      bValues.push(state.b);
    });
    expect(bValues).toEqual([2]);
    delete state.b;
    expect(bValues).toEqual([2, undefined]);
  });

  test("setting array length directly triggers reactivity", () => {
    const state = createStore({ items: [1, 2, 3, 4, 5] });
    const lengths: number[] = [];
    effect(() => {
      lengths.push(state.items.length);
    });
    expect(lengths).toEqual([5]);
    state.items.length = 2;
    expect(lengths).toEqual([5, 2]);
  });

  test("symbol property access does not trigger tracking", () => {
    const sym = Symbol("test");
    const raw = { x: 1 } as Record<string | symbol, unknown>;
    raw[sym] = "hidden";
    const state = createStore(raw);
    expect(state[sym]).toBe("hidden");
  });

  test("symbol property set goes through to target", () => {
    const sym = Symbol("test");
    const state = createStore({} as Record<string | symbol, unknown>);
    state[sym] = "value";
    expect(state[sym]).toBe("value");
  });

  test("has trap works with in operator", () => {
    const state = createStore({ a: 1 });
    expect("a" in state).toBe(true);
    expect("b" in state).toBe(false);
  });

  test("ownKeys returns correct keys", () => {
    const state = createStore({ a: 1, b: 2 });
    expect(Object.keys(state)).toEqual(["a", "b"]);
  });
});

describe("reconcile", () => {
  test("updates only changed scalar properties", () => {
    const state = createStore({ name: "Alice", age: 30 });
    const nameCalls: string[] = [];
    const ageCalls: number[] = [];
    effect(() => {
      nameCalls.push(state.name);
    });
    effect(() => {
      ageCalls.push(state.age);
    });
    reconcile({ name: "Alice", age: 31 }, state);
    expect(nameCalls).toEqual(["Alice"]); // unchanged — no re-run
    expect(ageCalls).toEqual([30, 31]); // changed — re-ran
  });

  test("reconciles nested objects recursively", () => {
    const state = createStore({ user: { name: "Alice", age: 30 } });
    const nameCalls: string[] = [];
    effect(() => {
      nameCalls.push(state.user.name);
    });
    reconcile({ user: { name: "Bob", age: 30 } }, state);
    expect(nameCalls).toEqual(["Alice", "Bob"]);
  });

  test("reconciles arrays by index", () => {
    const state = createStore({ items: ["a", "b", "c"] });
    const calls: string[][] = [];
    effect(() => {
      calls.push([...state.items]);
    });
    reconcile({ items: ["a", "X", "c"] }, state);
    expect(state.items[1]).toBe("X");
    expect(calls.length).toBe(2); // initial + after reconcile
  });

  test("trims excess array elements", () => {
    const state = createStore({ items: [1, 2, 3, 4, 5] });
    reconcile({ items: [1, 2] }, state);
    expect(state.items.length).toBe(2);
  });

  test("removes deleted keys", () => {
    const state = createStore({ a: 1, b: 2, c: 3 } as Record<string, number>);
    reconcile({ a: 1, b: 2 }, state);
    expect("c" in state).toBe(false);
  });
});
