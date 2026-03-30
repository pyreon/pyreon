import { signal } from "../signal";
import { watch } from "../watch";

describe("watch", () => {
  test("calls callback when source changes", () => {
    const s = signal(1);
    const calls: [number, number | undefined][] = [];

    watch(
      () => s(),
      (newVal, oldVal) => {
        calls.push([newVal, oldVal]);
      },
    );

    expect(calls.length).toBe(0); // not called on first run without immediate

    s.set(2);
    expect(calls).toEqual([[2, 1]]);

    s.set(3);
    expect(calls).toEqual([
      [2, 1],
      [3, 2],
    ]);
  });

  test("immediate option calls callback on first run", () => {
    const s = signal(1);
    const calls: [number, number | undefined][] = [];

    watch(
      () => s(),
      (newVal, oldVal) => {
        calls.push([newVal, oldVal]);
      },
      { immediate: true },
    );

    expect(calls).toEqual([[1, undefined]]);
  });

  test("stop function disposes the watcher", () => {
    const s = signal(1);
    let callCount = 0;

    const stop = watch(
      () => s(),
      () => {
        callCount++;
      },
    );

    s.set(2);
    expect(callCount).toBe(1);

    stop();

    s.set(3);
    expect(callCount).toBe(1); // no more calls
  });

  test("cleanup function is called before each re-run", () => {
    const s = signal(1);
    const log: string[] = [];

    watch(
      () => s(),
      (newVal) => {
        log.push(`run-${newVal}`);
        return () => log.push(`cleanup-${newVal}`);
      },
    );

    s.set(2);
    expect(log).toEqual(["run-2"]);

    s.set(3);
    expect(log).toEqual(["run-2", "cleanup-2", "run-3"]);
  });

  test("cleanup function from immediate is called on next change", () => {
    const s = signal(1);
    const log: string[] = [];

    watch(
      () => s(),
      (newVal) => {
        log.push(`run-${newVal}`);
        return () => log.push(`cleanup-${newVal}`);
      },
      { immediate: true },
    );

    expect(log).toEqual(["run-1"]);

    s.set(2);
    expect(log).toEqual(["run-1", "cleanup-1", "run-2"]);
  });

  test("cleanup is called on stop", () => {
    const s = signal(1);
    const log: string[] = [];

    const stop = watch(
      () => s(),
      (newVal) => {
        log.push(`run-${newVal}`);
        return () => log.push(`cleanup-${newVal}`);
      },
    );

    s.set(2);
    expect(log).toEqual(["run-2"]);

    stop();
    expect(log).toEqual(["run-2", "cleanup-2"]);
  });

  test("callback returning non-function does not set cleanup", () => {
    const s = signal(1);
    let callCount = 0;

    watch(
      () => s(),
      () => {
        callCount++;
        // returns void, not a function
      },
    );

    s.set(2);
    s.set(3);
    expect(callCount).toBe(2);
  });

  test("stop without cleanup does not throw", () => {
    const s = signal(1);
    const stop = watch(
      () => s(),
      () => {},
    );

    stop(); // no cleanup function was set, should not throw
  });

  test("oldValue tracks previous value across multiple changes", () => {
    const s = signal("a");
    const history: [string, string | undefined][] = [];

    watch(
      () => s(),
      (newVal, oldVal) => {
        history.push([newVal, oldVal]);
      },
    );

    s.set("b");
    s.set("c");
    s.set("d");

    expect(history).toEqual([
      ["b", "a"],
      ["c", "b"],
      ["d", "c"],
    ]);
  });

  test("oldValue is undefined on immediate first call", () => {
    const s = signal(42);
    let receivedOld: number | undefined = -1;

    watch(
      () => s(),
      (_newVal, oldVal) => {
        receivedOld = oldVal;
      },
      { immediate: true },
    );

    expect(receivedOld).toBeUndefined();
  });

  test("watch with derived source (computed-like)", () => {
    const a = signal(1);
    const b = signal(10);
    const calls: [number, number | undefined][] = [];

    watch(
      () => a() + b(),
      (newVal, oldVal) => {
        calls.push([newVal, oldVal]);
      },
    );

    a.set(2); // 2 + 10 = 12
    expect(calls).toEqual([[12, 11]]);

    b.set(20); // 2 + 20 = 22
    expect(calls).toEqual([
      [12, 11],
      [22, 12],
    ]);
  });

  test("stop prevents cleanup from running on future changes", () => {
    const s = signal(1);
    const log: string[] = [];

    const stop = watch(
      () => s(),
      (newVal) => {
        log.push(`run-${newVal}`);
        return () => log.push(`cleanup-${newVal}`);
      },
    );

    s.set(2);
    expect(log).toEqual(["run-2"]);

    stop();
    expect(log).toEqual(["run-2", "cleanup-2"]);

    // Further changes should not trigger anything
    s.set(3);
    expect(log).toEqual(["run-2", "cleanup-2"]);
  });

  test("watch does not fire when value stays the same", () => {
    const s = signal(1);
    let callCount = 0;

    watch(
      () => s(),
      () => {
        callCount++;
      },
    );

    s.set(1); // same value — signal doesn't notify
    expect(callCount).toBe(0);

    s.set(2);
    expect(callCount).toBe(1);
  });
});
