import type { ErrorContext } from "../telemetry";
import { registerErrorHandler, reportError } from "../telemetry";

describe("registerErrorHandler", () => {
  test("registers handler that receives error context", () => {
    const contexts: ErrorContext[] = [];
    const unsub = registerErrorHandler((ctx) => {
      contexts.push(ctx);
    });

    const ctx: ErrorContext = {
      component: "TestComp",
      phase: "render",
      error: new Error("test"),
      timestamp: 1234567890,
    };
    reportError(ctx);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toBe(ctx);

    unsub();
  });

  test("returns unregister function", () => {
    let count = 0;
    const unsub = registerErrorHandler(() => {
      count++;
    });

    reportError({ component: "A", phase: "setup", error: "e1", timestamp: 0 });
    expect(count).toBe(1);

    unsub();

    reportError({ component: "B", phase: "render", error: "e2", timestamp: 0 });
    expect(count).toBe(1); // not called after unregister
  });

  test("multiple handlers are all called", () => {
    let count = 0;
    const unsub1 = registerErrorHandler(() => count++);
    const unsub2 = registerErrorHandler(() => count++);
    const unsub3 = registerErrorHandler(() => count++);

    reportError({ component: "X", phase: "mount", error: "err", timestamp: 0 });
    expect(count).toBe(3);

    unsub1();
    unsub2();
    unsub3();
  });

  test("handler errors are swallowed — subsequent handlers still called", () => {
    let secondCalled = false;
    let thirdCalled = false;

    const unsub1 = registerErrorHandler(() => {
      throw new Error("handler crash");
    });
    const unsub2 = registerErrorHandler(() => {
      secondCalled = true;
    });
    const unsub3 = registerErrorHandler(() => {
      thirdCalled = true;
    });

    // Should not throw
    expect(() =>
      reportError({ component: "Y", phase: "unmount", error: "err", timestamp: 0 }),
    ).not.toThrow();
    expect(secondCalled).toBe(true);
    expect(thirdCalled).toBe(true);

    unsub1();
    unsub2();
    unsub3();
  });

  test("unregistering one handler does not affect others", () => {
    const calls: string[] = [];
    const unsub1 = registerErrorHandler(() => calls.push("a"));
    const unsub2 = registerErrorHandler(() => calls.push("b"));
    const unsub3 = registerErrorHandler(() => calls.push("c"));

    unsub2(); // remove middle handler

    reportError({ component: "Z", phase: "effect", error: "e", timestamp: 0 });
    expect(calls).toEqual(["a", "c"]);

    unsub1();
    unsub3();
  });
});

describe("reportError", () => {
  test("no-op when no handlers registered", () => {
    // Should not throw
    expect(() =>
      reportError({ component: "None", phase: "setup", error: "err", timestamp: 0 }),
    ).not.toThrow();
  });

  test("passes full ErrorContext to handler", () => {
    let received: ErrorContext | null = null;
    const unsub = registerErrorHandler((ctx) => {
      received = ctx;
    });

    const ctx: ErrorContext = {
      component: "MyComp",
      phase: "render",
      error: new Error("detail"),
      timestamp: 999,
      props: { a: 1, b: "two" },
    };
    reportError(ctx);

    expect(received).not.toBeNull();
    expect(received!.component).toBe("MyComp");
    expect(received!.phase).toBe("render");
    expect(received!.error).toBeInstanceOf(Error);
    expect(received!.timestamp).toBe(999);
    expect(received!.props).toEqual({ a: 1, b: "two" });

    unsub();
  });

  test("handles all phase types", () => {
    const phases: ErrorContext["phase"][] = ["setup", "render", "mount", "unmount", "effect"];
    const seen: string[] = [];
    const unsub = registerErrorHandler((ctx) => {
      seen.push(ctx.phase);
    });

    for (const phase of phases) {
      reportError({ component: "X", phase, error: "e", timestamp: 0 });
    }
    expect(seen).toEqual(phases);

    unsub();
  });
});
