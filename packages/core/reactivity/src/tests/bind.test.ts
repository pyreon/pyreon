import { _bind } from "../effect";
import { signal } from "../signal";

describe("_bind (static-dep binding)", () => {
  test("runs the function on first call and tracks deps", () => {
    const s = signal(0);
    let runs = 0;

    const dispose = _bind(() => {
      s();
      runs++;
    });

    expect(runs).toBe(1);

    // Deps tracked on first run, re-runs on signal change
    s.set(1);
    expect(runs).toBe(2);

    dispose();
  });

  test("dispose stops re-runs", () => {
    const s = signal(0);
    let runs = 0;

    const dispose = _bind(() => {
      s();
      runs++;
    });

    expect(runs).toBe(1);

    dispose();
    s.set(1);
    expect(runs).toBe(1); // no re-run
  });

  test("dispose is idempotent", () => {
    const s = signal(0);
    const dispose = _bind(() => {
      s();
    });

    dispose();
    dispose(); // should not throw
  });

  test("does not re-run after dispose even with multiple deps", () => {
    const a = signal(0);
    const b = signal(0);
    let runs = 0;

    const dispose = _bind(() => {
      a();
      b();
      runs++;
    });

    expect(runs).toBe(1);

    dispose();
    a.set(1);
    b.set(1);
    expect(runs).toBe(1);
  });

  test("disposed run callback is a no-op", () => {
    const s = signal(0);
    let runs = 0;

    const dispose = _bind(() => {
      s();
      runs++;
    });

    expect(runs).toBe(1);

    // Dispose then trigger — the run function should bail out
    dispose();
    s.set(5);
    expect(runs).toBe(1);
  });
});
