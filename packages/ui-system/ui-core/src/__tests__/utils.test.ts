import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, merge, omit, pick, set, throttle } from "../utils";

// --------------------------------------------------------
// omit
// --------------------------------------------------------
describe("omit", () => {
  it("should return object without specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("should return shallow copy when no keys specified", () => {
    const obj = { a: 1, b: 2 };
    const result = omit(obj);
    expect(result).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(obj);
  });

  it("should return shallow copy when keys is empty array", () => {
    const obj = { a: 1 };
    expect(omit(obj, [])).toEqual({ a: 1 });
  });

  it("should return empty object for null", () => {
    expect(omit(null)).toEqual({});
  });

  it("should return empty object for undefined", () => {
    expect(omit(undefined)).toEqual({});
  });

  it("should handle multiple keys", () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    expect(omit(obj, ["a", "c"])).toEqual({ b: 2, d: 4 });
  });

  it("should ignore keys not present in object", () => {
    const obj = { a: 1 };
    expect(omit(obj, ["b", "c"])).toEqual({ a: 1 });
  });

  it("should only include own properties", () => {
    const proto = { inherited: true };
    const obj = Object.create(proto);
    obj.own = 1;
    expect(omit(obj, [])).toEqual({ own: 1 });
  });
});

// --------------------------------------------------------
// pick
// --------------------------------------------------------
describe("pick", () => {
  it("should return object with only specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("should return shallow copy when no keys specified", () => {
    const obj = { a: 1, b: 2 };
    const result = pick(obj);
    expect(result).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(obj);
  });

  it("should return shallow copy when keys is empty array", () => {
    const obj = { a: 1 };
    expect(pick(obj, [])).toEqual({ a: 1 });
  });

  it("should return empty object for null", () => {
    expect(pick(null)).toEqual({});
  });

  it("should return empty object for undefined", () => {
    expect(pick(undefined)).toEqual({});
  });

  it("should ignore keys not present in object", () => {
    const obj = { a: 1 };
    expect(pick(obj, ["a", "b"])).toEqual({ a: 1 });
  });

  it("should only pick own properties", () => {
    const proto = { inherited: true };
    const obj = Object.create(proto);
    obj.own = 1;
    expect(pick(obj, ["own", "inherited"])).toEqual({ own: 1 });
  });
});

// --------------------------------------------------------
// get
// --------------------------------------------------------
describe("get", () => {
  it("should get nested value by dot path", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(get(obj, "a.b.c")).toBe(42);
  });

  it("should get value by array path", () => {
    const obj = { a: { b: 10 } };
    expect(get(obj, ["a", "b"])).toBe(10);
  });

  it("should get array element by bracket notation", () => {
    const obj = { items: [10, 20, 30] };
    expect(get(obj, "items[1]")).toBe(20);
  });

  it("should return defaultValue when path does not exist", () => {
    const obj = { a: 1 };
    expect(get(obj, "b.c", "default")).toBe("default");
  });

  it("should return defaultValue when intermediate is null", () => {
    const obj = { a: null };
    expect(get(obj, "a.b", "fallback")).toBe("fallback");
  });

  it("should return defaultValue when intermediate is undefined", () => {
    const obj = { a: undefined };
    expect(get(obj, "a.b", "fallback")).toBe("fallback");
  });

  it("should return undefined when path does not exist and no default", () => {
    expect(get({}, "a.b.c")).toBeUndefined();
  });

  it("should return the root value for empty array path", () => {
    const obj = { a: 1 };
    expect(get(obj, [])).toEqual({ a: 1 });
  });

  it("should handle top-level key", () => {
    expect(get({ x: 5 }, "x")).toBe(5);
  });

  it("should return actual value even if it is falsy", () => {
    expect(get({ a: 0 }, "a", "default")).toBe(0);
    expect(get({ a: false }, "a", "default")).toBe(false);
    expect(get({ a: "" }, "a", "default")).toBe("");
    expect(get({ a: null }, "a", "default")).toBeNull();
  });

  it("should use defaultValue only when result is undefined", () => {
    expect(get({ a: undefined }, "a", "default")).toBe("default");
  });

  // UNSAFE_KEYS guard
  it("should return defaultValue for __proto__ key", () => {
    const obj = { a: 1 };
    expect(get(obj, "__proto__", "safe")).toBe("safe");
  });

  it("should return defaultValue for prototype key", () => {
    const obj = { a: 1 };
    expect(get(obj, "prototype", "safe")).toBe("safe");
  });

  it("should return defaultValue for constructor key", () => {
    const obj = { a: 1 };
    expect(get(obj, "constructor", "safe")).toBe("safe");
  });

  it("should return defaultValue for __proto__ in nested path", () => {
    const obj = { a: { b: 1 } };
    expect(get(obj, "a.__proto__.c", "safe")).toBe("safe");
  });

  it("should return obj itself for empty string path (no keys parsed)", () => {
    // parsePath('') returns [] — no iteration — result stays as obj
    // obj is not undefined — returned as-is
    expect(get({ a: 1 }, "")).toEqual({ a: 1 });
  });
});

// --------------------------------------------------------
// set
// --------------------------------------------------------
describe("set", () => {
  it("should set nested value by dot path", () => {
    const obj: any = {};
    set(obj, "a.b.c", 42);
    expect(obj.a.b.c).toBe(42);
  });

  it("should set value by array path", () => {
    const obj: any = {};
    set(obj, ["x", "y"], 10);
    expect(obj.x.y).toBe(10);
  });

  it("should create arrays for numeric keys", () => {
    const obj: any = {};
    set(obj, "items.0", "first");
    expect(Array.isArray(obj.items)).toBe(true);
    expect(obj.items[0]).toBe("first");
  });

  it("should overwrite existing values", () => {
    const obj = { a: { b: 1 } };
    set(obj, "a.b", 2);
    expect(obj.a.b).toBe(2);
  });

  it("should return the mutated object", () => {
    const obj = {};
    const result = set(obj, "a", 1);
    expect(result).toBe(obj);
  });

  it("should handle single key path", () => {
    const obj: any = {};
    set(obj, "key", "value");
    expect(obj.key).toBe("value");
  });

  it("should not set anything for empty path", () => {
    const obj = { a: 1 };
    set(obj, "", "value");
    expect(obj).toEqual({ a: 1 });
  });

  // Security: prototype pollution protection
  it("should not pollute Object.prototype via __proto__", () => {
    const obj = {};
    set(obj, "__proto__.polluted", true);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("should not pollute via constructor.prototype", () => {
    const obj = {};
    set(obj, "constructor.prototype.polluted", true);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("should bail out when intermediate key is __proto__", () => {
    const obj: any = { a: 1 };
    const result = set(obj, "__proto__.polluted", true);
    expect(result).toBe(obj);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("should bail out when next key in path is unsafe", () => {
    const obj: any = {};
    const result = set(obj, "a.__proto__", "bad");
    expect(result).toBe(obj);
    expect(obj.a).toBeUndefined();
  });

  it("should bail out when last key is unsafe", () => {
    const obj: any = {};
    set(obj, "prototype", "bad");
    // prototype is in UNSAFE_KEYS, so the set should be blocked
    expect(obj.prototype).toBeUndefined();
  });

  it("should handle bracket notation in paths", () => {
    const obj: any = {};
    set(obj, "items[0].name", "first");
    expect(obj.items[0].name).toBe("first");
  });

  it("should not overwrite existing intermediate objects", () => {
    const obj: any = { a: { existing: true } };
    set(obj, "a.b", "new");
    expect(obj.a.existing).toBe(true);
    expect(obj.a.b).toBe("new");
  });
});

// --------------------------------------------------------
// throttle
// --------------------------------------------------------
describe("throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call function immediately on first invocation", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled("a");
    expect(fn).toHaveBeenCalledWith("a");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should not call again within wait period", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should call with latest args after wait period", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("first");
    throttled("second");
    throttled("third");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("first");

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("third");
  });

  it("should allow immediate call after wait period elapses", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should cancel pending invocations", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("first");
    throttled("second");
    throttled.cancel();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should work with default wait of 0", () => {
    const fn = vi.fn();
    const throttled = throttle(fn);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should skip trailing call when trailing: false", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100, { trailing: false });

    throttled("first");
    throttled("second");
    throttled("third");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("first");

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should skip leading call when leading: false", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100, { leading: false });

    throttled("first");
    expect(fn).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("first");
  });

  it("should support leading: false with trailing: true (default)", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100, { leading: false });

    throttled("a");
    throttled("b");
    expect(fn).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("should still fire leading call after cooldown with trailing: false", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100, { trailing: false });

    throttled("first");
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    throttled("second");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("second");
  });

  it("should not fire trailing call when cancelled before timer fires", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    // Leading call fires immediately
    throttled("first");
    expect(fn).toHaveBeenCalledTimes(1);

    // Call again within wait period — queues trailing
    throttled("second");

    // Cancel before trailing timer fires
    throttled.cancel();

    vi.advanceTimersByTime(200);
    // Should not have fired the trailing call
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should handle leading: false with trailing: false (no calls fire)", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100, { leading: false, trailing: false });

    throttled("a");
    expect(fn).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(0);
  });
});

// --------------------------------------------------------
// merge
// --------------------------------------------------------
describe("merge", () => {
  it("should deep merge two objects", () => {
    const target = { a: { b: 1, c: 2 } };
    const source = { a: { c: 3, d: 4 } };
    expect(merge({ ...target }, source)).toEqual({ a: { b: 1, c: 3, d: 4 } });
  });

  it("should replace arrays instead of merging them", () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    expect(merge({ ...target }, source)).toEqual({ items: [4, 5] });
  });

  it("should handle multiple sources", () => {
    const result = merge({ a: 1 }, { b: 2 }, { c: 3 });
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("should overwrite primitive values", () => {
    expect(merge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("should skip null sources", () => {
    const target = { a: 1 };
    expect(merge(target, null as any)).toEqual({ a: 1 });
  });

  it("should skip undefined sources", () => {
    const target = { a: 1 };
    expect(merge(target, undefined as any)).toEqual({ a: 1 });
  });

  it("should not merge non-plain objects deeply", () => {
    const date = new Date();
    const result = merge({} as any, { d: date });
    expect(result.d).toBe(date);
  });

  it("should return the target object (mutates)", () => {
    const target = { a: 1 };
    const result = merge(target, { b: 2 });
    expect(result).toBe(target);
  });

  it("should deeply merge nested objects", () => {
    const target = { a: { b: { c: 1 } } };
    const source = { a: { b: { d: 2 } } };
    expect(merge({ ...target }, source)).toEqual({
      a: { b: { c: 1, d: 2 } },
    });
  });

  // Security: prototype pollution protection
  it("should not pollute Object.prototype via __proto__", () => {
    const malicious = JSON.parse('{"__proto__": {"polluted": true}}');
    merge({}, malicious);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("should not pollute via constructor.prototype", () => {
    const malicious = JSON.parse('{"constructor": {"prototype": {"polluted": true}}}');
    merge({}, malicious);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("should not pollute via prototype key", () => {
    const malicious = { prototype: { polluted: true } };
    merge({}, malicious);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("should overwrite target plain object with source array", () => {
    const target = { a: { b: 1 } };
    const source = { a: [1, 2, 3] };
    const result = merge({ ...target }, source as any);
    expect(result.a).toEqual([1, 2, 3]);
  });

  it("should overwrite target array with source plain object", () => {
    const target = { a: [1, 2] } as any;
    const source = { a: { key: "value" } };
    const result = merge({ ...target }, source);
    expect(result.a).toEqual({ key: "value" });
  });

  it("should handle source with class instances (non-plain objects)", () => {
    class MyClass {
      x = 1;
    }
    const instance = new MyClass();
    const target = { a: { old: true } };
    const result = merge({ ...target }, { a: instance } as any);
    // class instances are not plain objects, so they replace (not deep merge)
    expect(result.a).toBe(instance);
  });

  it("should handle empty sources array", () => {
    const target = { a: 1 };
    const result = merge(target);
    expect(result).toEqual({ a: 1 });
  });
});
