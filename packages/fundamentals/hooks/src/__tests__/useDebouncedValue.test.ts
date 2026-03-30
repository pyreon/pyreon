import { signal } from "@pyreon/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "../useDebouncedValue";

// Mock onUnmount since it requires component lifecycle context
vi.mock("@pyreon/core", () => ({
  onMount: (fn: () => void) => fn(),
  onUnmount: (_fn: () => void) => {
    /* no-op */
  },
}));

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const source = signal(42);
    const debounced = useDebouncedValue(source, 300);
    expect(debounced()).toBe(42);
  });

  it("does not update immediately when source changes", () => {
    const source = signal("hello");
    const debounced = useDebouncedValue(source, 300);
    expect(debounced()).toBe("hello");

    source.set("world");
    expect(debounced()).toBe("hello");
  });

  it("updates after the delay elapses", () => {
    const source = signal("hello");
    const debounced = useDebouncedValue(source, 300);

    source.set("world");
    expect(debounced()).toBe("hello");

    vi.advanceTimersByTime(300);
    expect(debounced()).toBe("world");
  });

  it("resets the timer on rapid changes", () => {
    const source = signal(1);
    const debounced = useDebouncedValue(source, 300);

    source.set(2);
    vi.advanceTimersByTime(100);
    expect(debounced()).toBe(1);

    source.set(3);
    vi.advanceTimersByTime(100);
    expect(debounced()).toBe(1);

    source.set(4);
    vi.advanceTimersByTime(300);
    expect(debounced()).toBe(4);
  });

  it("only applies the last value after debounce", () => {
    const source = signal(0);
    const debounced = useDebouncedValue(source, 200);

    source.set(1);
    source.set(2);
    source.set(3);
    source.set(4);
    source.set(5);

    vi.advanceTimersByTime(200);
    expect(debounced()).toBe(5);
  });

  it("handles multiple debounce cycles", () => {
    const source = signal("a");
    const debounced = useDebouncedValue(source, 100);

    source.set("b");
    vi.advanceTimersByTime(100);
    expect(debounced()).toBe("b");

    source.set("c");
    vi.advanceTimersByTime(100);
    expect(debounced()).toBe("c");
  });

  it("works with zero delay", () => {
    const source = signal(1);
    const debounced = useDebouncedValue(source, 0);

    source.set(2);
    vi.advanceTimersByTime(0);
    expect(debounced()).toBe(2);
  });

  it("works with object values", () => {
    const obj1 = { name: "Alice" };
    const obj2 = { name: "Bob" };
    const source = signal(obj1);
    const debounced = useDebouncedValue(source, 100);
    expect(debounced()).toBe(obj1);

    source.set(obj2);
    vi.advanceTimersByTime(100);
    expect(debounced()).toBe(obj2);
  });
});
