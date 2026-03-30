import { batch, nextTick } from "../batch";
import { effect } from "../effect";
import { signal } from "../signal";

describe("batch", () => {
  test("defers notifications until end of batch", () => {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    effect(() => {
      a();
      b();
      runs++;
    });
    expect(runs).toBe(1); // initial run

    batch(() => {
      a.set(10);
      b.set(20);
    });
    // should only re-run once despite two updates
    expect(runs).toBe(2);
  });

  test("effect sees final values after batch", () => {
    const s = signal(0);
    let seen = 0;
    effect(() => {
      seen = s();
    });
    batch(() => {
      s.set(1);
      s.set(2);
      s.set(3);
    });
    expect(seen).toBe(3);
  });

  test("nested batches flush at outermost end", () => {
    const s = signal(0);
    let runs = 0;
    effect(() => {
      s();
      runs++;
    });
    expect(runs).toBe(1);

    batch(() => {
      batch(() => {
        s.set(1);
        s.set(2);
      });
      s.set(3);
    });
    expect(runs).toBe(2);
  });

  test("batch propagates exceptions and still flushes", () => {
    const s = signal(0);
    let seen = 0;
    effect(() => {
      seen = s();
    });
    expect(seen).toBe(0);

    expect(() => {
      batch(() => {
        s.set(42);
        throw new Error("boom");
      });
    }).toThrow("boom");

    // The batch should still have flushed notifications in the finally block
    expect(seen).toBe(42);
  });

  test("batch with no signal changes is a no-op", () => {
    let runs = 0;
    const s = signal(0);
    effect(() => {
      s();
      runs++;
    });
    expect(runs).toBe(1);

    batch(() => {
      // no updates
    });
    expect(runs).toBe(1);
  });

  test("batch deduplicates same subscriber across multiple signals", () => {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    effect(() => {
      a();
      b();
      runs++;
    });
    expect(runs).toBe(1);

    batch(() => {
      a.set(10);
      b.set(20);
      a.set(100); // same signal updated again
    });
    // Effect should only run once despite 3 updates
    expect(runs).toBe(2);
  });

  test("notifications enqueued during flush land in alternate set", () => {
    const a = signal(0);
    const b = signal(0);
    const log: string[] = [];

    effect(() => {
      const val = a();
      log.push(`a=${val}`);
      // When a changes, update b inside the effect (enqueue during flush)
      if (val > 0) b.set(val * 10);
    });
    effect(() => {
      log.push(`b=${b()}`);
    });

    batch(() => {
      a.set(1);
    });

    expect(log).toContain("a=1");
    expect(log).toContain("b=10");
  });

  test("nextTick resolves after microtasks flush", async () => {
    const s = signal(0);
    let seen = 0;
    effect(() => {
      seen = s();
    });

    s.set(42);
    await nextTick();
    expect(seen).toBe(42);
  });
});
