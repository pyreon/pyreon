import { effect } from "@pyreon/reactivity";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetRegistry, createStorage, useMemoryStorage } from "../index";

describe("useMemoryStorage", () => {
  beforeEach(() => {
    _resetRegistry();
  });

  afterEach(() => {
    _resetRegistry();
  });

  it("works without any browser storage APIs (SSR-safe)", () => {
    const sig = useMemoryStorage("ssr-key", "default");
    expect(sig()).toBe("default");
    sig.set("updated");
    expect(sig()).toBe("updated");
  });

  it("persists values within the same session", () => {
    const sig = useMemoryStorage("persist-key", "initial");
    sig.set("saved");
    expect(sig()).toBe("saved");
  });

  it("deduplicates signals for same key", () => {
    const a = useMemoryStorage("dedup", "val");
    const b = useMemoryStorage("dedup", "val");
    expect(a).toBe(b);
  });

  it("returns different signals for different keys", () => {
    const a = useMemoryStorage("key-a", "val");
    const b = useMemoryStorage("key-b", "val");
    expect(a).not.toBe(b);
  });

  it(".remove() resets to default", () => {
    const sig = useMemoryStorage("removable", "default");
    sig.set("changed");
    sig.remove();
    expect(sig()).toBe("default");
  });

  it("after remove, a new call creates a fresh signal", () => {
    const a = useMemoryStorage("fresh", "first");
    a.set("modified");
    a.remove();

    const b = useMemoryStorage("fresh", "second");
    expect(b()).toBe("second");
    expect(a).not.toBe(b);
  });

  it(".update() works", () => {
    const count = useMemoryStorage("count", 0);
    count.update((n) => n + 1);
    count.update((n) => n + 1);
    expect(count()).toBe(2);
  });

  it(".peek() reads without subscribing", () => {
    const sig = useMemoryStorage("peek-key", "val");
    expect(sig.peek()).toBe("val");
  });

  it("is reactive in effects", () => {
    const sig = useMemoryStorage("reactive", "a");
    const values: string[] = [];

    effect(() => {
      values.push(sig());
    });

    sig.set("b");
    sig.set("c");

    expect(values).toEqual(["a", "b", "c"]);
  });

  it("works with complex objects", () => {
    const sig = useMemoryStorage("obj", { name: "", items: [] as string[] });
    sig.set({ name: "test", items: ["a", "b"] });
    expect(sig()).toEqual({ name: "test", items: ["a", "b"] });
  });

  it("works with arrays", () => {
    const sig = useMemoryStorage("arr", [1, 2, 3]);
    sig.set([4, 5, 6]);
    expect(sig()).toEqual([4, 5, 6]);
  });

  it("works with booleans", () => {
    const sig = useMemoryStorage("bool", false);
    sig.set(true);
    expect(sig()).toBe(true);
  });

  it("works with null default", () => {
    const sig = useMemoryStorage<string | null>("nullable", null);
    expect(sig()).toBeNull();
    sig.set("value");
    expect(sig()).toBe("value");
    sig.remove();
    expect(sig()).toBeNull();
  });

  it(".debug() returns debug info", () => {
    const sig = useMemoryStorage("debug", "test");
    expect(sig.debug().value).toBe("test");
  });

  it(".label can be set and read", () => {
    const sig = useMemoryStorage("label", "val");
    sig.label = "my-memory-signal";
    expect(sig.label).toBe("my-memory-signal");
  });

  it(".subscribe() works", () => {
    const sig = useMemoryStorage("sub", "a");
    let called = false;
    const unsub = sig.subscribe(() => {
      called = true;
    });
    sig.set("b");
    expect(called).toBe(true);
    unsub();
  });

  it(".direct() works", () => {
    const sig = useMemoryStorage("dir", "a");
    let called = false;
    const unsub = sig.direct(() => {
      called = true;
    });
    sig.set("b");
    expect(called).toBe(true);
    unsub();
  });
});

describe("createStorage — custom backends", () => {
  beforeEach(() => {
    _resetRegistry();
  });

  afterEach(() => {
    _resetRegistry();
  });

  it("creates storage with a simple Map backend", () => {
    const store = new Map<string, string>();
    const useCustom = createStorage({
      get: (k) => store.get(k) ?? null,
      set: (k, v) => store.set(k, v),
      remove: (k) => store.delete(k),
    });

    const sig = useCustom("key", "default");
    expect(sig()).toBe("default");

    sig.set("value");
    expect(sig()).toBe("value");
    expect(store.get("key")).toBe(JSON.stringify("value"));
  });

  it("creates a named backend for separate deduplication", () => {
    const storeA = new Map<string, string>();
    const storeB = new Map<string, string>();

    const useBackendA = createStorage(
      {
        get: (k) => storeA.get(k) ?? null,
        set: (k, v) => storeA.set(k, v),
        remove: (k) => storeA.delete(k),
      },
      "backend-a",
    );

    const useBackendB = createStorage(
      {
        get: (k) => storeB.get(k) ?? null,
        set: (k, v) => storeB.set(k, v),
        remove: (k) => storeB.delete(k),
      },
      "backend-b",
    );

    const sigA = useBackendA("key", "a-default");
    const sigB = useBackendB("key", "b-default");

    // Different backends, same key — should be different signals
    expect(sigA).not.toBe(sigB);
    expect(sigA()).toBe("a-default");
    expect(sigB()).toBe("b-default");
  });

  it("backend that transforms values (encryption-like)", () => {
    // Simple "encryption" — just base64 encode/decode
    const store = new Map<string, string>();
    const useEncrypted = createStorage({
      get: (k) => {
        const v = store.get(k);
        return v ? atob(v) : null;
      },
      set: (k, v) => store.set(k, btoa(v)),
      remove: (k) => store.delete(k),
    });

    const sig = useEncrypted("secret", "default");
    sig.set("my-secret-value");

    expect(sig()).toBe("my-secret-value");
    // Raw stored value should be base64 encoded
    const raw = store.get("secret");
    expect(raw).toBe(btoa(JSON.stringify("my-secret-value")));
  });

  it("handles backend.remove() errors gracefully", () => {
    const useCustom = createStorage({
      get: () => null,
      set: () => {
        // no-op
      },
      remove: () => {
        throw new Error("remove failed");
      },
    });

    const sig = useCustom("key", "default");
    sig.set("value");
    // remove() should not throw
    sig.remove();
    expect(sig()).toBe("default");
  });

  it("multiple hooks on same custom backend share deduplication", () => {
    const store = new Map<string, string>();
    const useCustom = createStorage(
      {
        get: (k) => store.get(k) ?? null,
        set: (k, v) => store.set(k, v),
        remove: (k) => store.delete(k),
      },
      "shared",
    );

    const sig1 = useCustom("shared-key", "default");
    sig1.set("updated");

    const sig2 = useCustom("shared-key", "default");
    expect(sig1).toBe(sig2); // Same instance
    expect(sig2()).toBe("updated");
  });
});
