import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _pauseAll, _reset, _resumeAll, _toasts, toast } from "../toast";

/** Helper — get toast at index with non-null assertion (tests verify length first). */
function at(index: number) {
  const t = _toasts()[index];
  if (!t) throw new Error(`No toast at index ${index}`);
  return t;
}

beforeEach(() => {
  _reset();
});

afterEach(() => {
  _reset();
});

describe("toast()", () => {
  it("adds a toast to the stack", () => {
    toast("Hello");
    expect(_toasts().length).toBe(1);
    expect(at(0).message).toBe("Hello");
  });

  it("returns the toast id", () => {
    const id = toast("Hello");
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^pyreon-toast-/);
  });

  it("defaults to type info", () => {
    toast("Hello");
    expect(at(0).type).toBe("info");
  });

  it("defaults dismissible to true", () => {
    toast("Hello");
    expect(at(0).dismissible).toBe(true);
  });

  it("respects custom options", () => {
    toast("Hello", { type: "error", duration: 0, dismissible: false });
    const t = at(0);
    expect(t.type).toBe("error");
    expect(t.duration).toBe(0);
    expect(t.dismissible).toBe(false);
  });
});

describe("toast.success/error/warning/info", () => {
  it("toast.success sets type to success", () => {
    toast.success("Done");
    expect(at(0).type).toBe("success");
  });

  it("toast.error sets type to error", () => {
    toast.error("Failed");
    expect(at(0).type).toBe("error");
  });

  it("toast.warning sets type to warning", () => {
    toast.warning("Watch out");
    expect(at(0).type).toBe("warning");
  });

  it("toast.info sets type to info", () => {
    toast.info("FYI");
    expect(at(0).type).toBe("info");
  });
});

describe("toast.dismiss", () => {
  it("removes a specific toast by id", () => {
    const id1 = toast("First");
    toast("Second");
    expect(_toasts().length).toBe(2);

    toast.dismiss(id1);
    expect(_toasts().length).toBe(1);
    expect(at(0).message).toBe("Second");
  });

  it("clears all toasts when no id is given", () => {
    toast("First");
    toast("Second");
    toast("Third");
    expect(_toasts().length).toBe(3);

    toast.dismiss();
    expect(_toasts().length).toBe(0);
  });

  it("is a no-op for unknown id", () => {
    toast("Hello");
    toast.dismiss("unknown-id");
    expect(_toasts().length).toBe(1);
  });

  it("calls onDismiss callback when dismissing by id", () => {
    const onDismiss = vi.fn();
    const id = toast("Hello", { onDismiss });
    toast.dismiss(id);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("calls onDismiss for all toasts when dismissing all", () => {
    const onDismiss1 = vi.fn();
    const onDismiss2 = vi.fn();
    toast("First", { onDismiss: onDismiss1 });
    toast("Second", { onDismiss: onDismiss2 });
    toast.dismiss();
    expect(onDismiss1).toHaveBeenCalledOnce();
    expect(onDismiss2).toHaveBeenCalledOnce();
  });
});

describe("auto-dismiss", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-dismisses after default duration (4000ms)", () => {
    toast("Hello");
    expect(_toasts().length).toBe(1);

    vi.advanceTimersByTime(3999);
    expect(_toasts().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(_toasts().length).toBe(0);
  });

  it("auto-dismisses after custom duration", () => {
    toast("Hello", { duration: 2000 });

    vi.advanceTimersByTime(1999);
    expect(_toasts().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(_toasts().length).toBe(0);
  });

  it("does not auto-dismiss when duration is 0", () => {
    toast("Persistent", { duration: 0 });

    vi.advanceTimersByTime(10000);
    expect(_toasts().length).toBe(1);
  });
});

describe("toast.promise", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a loading toast that updates on resolve", async () => {
    const promise = Promise.resolve("data");

    toast.promise(promise, {
      loading: "Loading...",
      success: "Done!",
      error: "Failed",
    });

    expect(_toasts().length).toBe(1);
    expect(at(0).message).toBe("Loading...");
    expect(at(0).type).toBe("info");
    expect(at(0).duration).toBe(0); // persistent while loading

    await promise;
    // Flush microtasks
    await vi.advanceTimersByTimeAsync(0);

    expect(_toasts().length).toBe(1);
    expect(at(0).message).toBe("Done!");
    expect(at(0).type).toBe("success");
  });

  it("creates a loading toast that updates on reject", async () => {
    const promise = Promise.reject(new Error("oops"));

    // Prevent unhandled rejection
    toast
      .promise(promise, {
        loading: "Loading...",
        success: "Done!",
        error: "Failed",
      })
      .catch(() => {});

    expect(at(0).message).toBe("Loading...");

    try {
      await promise;
    } catch {
      // expected
    }

    await vi.advanceTimersByTimeAsync(0);

    expect(_toasts().length).toBe(1);
    expect(at(0).message).toBe("Failed");
    expect(at(0).type).toBe("error");
  });

  it("supports function form for success/error messages", async () => {
    const promise = Promise.resolve(42);

    toast.promise(promise, {
      loading: "Calculating...",
      success: (data) => `Result: ${data}`,
      error: (err) => `Error: ${err}`,
    });

    await promise;
    await vi.advanceTimersByTimeAsync(0);

    expect(at(0).message).toBe("Result: 42");
  });

  it("returns the original promise", async () => {
    const promise = Promise.resolve("value");
    const result = toast.promise(promise, {
      loading: "Loading...",
      success: "Done!",
      error: "Failed",
    });

    expect(await result).toBe("value");
  });
});

describe("toast.loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a persistent toast with type info", () => {
    const id = toast.loading("Please wait...");
    expect(_toasts().length).toBe(1);
    expect(at(0).message).toBe("Please wait...");
    expect(at(0).type).toBe("info");
    expect(at(0).duration).toBe(0);

    // Should not auto-dismiss even after a long time
    vi.advanceTimersByTime(30000);
    expect(_toasts().length).toBe(1);
    expect(at(0).id).toBe(id);
  });

  it("returns an id that can be dismissed manually", () => {
    const id = toast.loading("Loading data...");
    expect(_toasts().length).toBe(1);

    toast.dismiss(id);
    expect(_toasts().length).toBe(0);
  });

  it("accepts options like onDismiss and action", () => {
    const onDismiss = vi.fn();
    const id = toast.loading("Loading...", { onDismiss });
    toast.dismiss(id);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("can be updated via toast.update after creation", () => {
    const id = toast.loading("Step 1...");
    expect(at(0).message).toBe("Step 1...");

    toast.update(id, { message: "Step 2..." });
    expect(at(0).message).toBe("Step 2...");
    expect(at(0).type).toBe("info");
  });
});

describe("toast.update", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates message of existing toast", () => {
    const id = toast("Original");
    toast.update(id, { message: "Updated" });
    expect(at(0).message).toBe("Updated");
  });

  it("updates type of existing toast", () => {
    const id = toast("Hello");
    expect(at(0).type).toBe("info");

    toast.update(id, { type: "success" });
    expect(at(0).type).toBe("success");
  });

  it("updates duration and restarts timer", () => {
    const id = toast("Hello", { duration: 0 }); // persistent
    expect(at(0).duration).toBe(0);

    vi.advanceTimersByTime(5000);
    expect(_toasts().length).toBe(1); // still there, duration was 0

    toast.update(id, { duration: 2000 });
    expect(at(0).duration).toBe(2000);

    vi.advanceTimersByTime(1999);
    expect(_toasts().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(_toasts().length).toBe(0); // auto-dismissed after new duration
  });

  it("is a no-op for unknown id", () => {
    toast("Hello");
    toast.update("nonexistent-id", { message: "Should not crash" });
    expect(at(0).message).toBe("Hello");
  });

  it("clears old timer when updating", () => {
    const id = toast("Hello", { duration: 1000 });

    vi.advanceTimersByTime(500);
    // Update resets the timer with the same duration
    toast.update(id, { message: "Updated" });

    vi.advanceTimersByTime(500);
    // Old timer would have fired at 1000ms total, but update reset it
    expect(_toasts().length).toBe(1);

    vi.advanceTimersByTime(500);
    // Now the new timer fires at 1000ms from update
    expect(_toasts().length).toBe(0);
  });

  it("can update multiple fields at once", () => {
    const id = toast("Loading...", { duration: 0 });
    toast.update(id, { message: "Done!", type: "success", duration: 3000 });

    expect(at(0).message).toBe("Done!");
    expect(at(0).type).toBe("success");
    expect(at(0).duration).toBe(3000);
  });
});

describe("pause/resume", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("_pauseAll stops all timers", () => {
    toast("First", { duration: 4000 });
    toast("Second", { duration: 4000 });

    vi.advanceTimersByTime(2000); // halfway

    _pauseAll();

    // Advance well past the original duration — should not dismiss
    vi.advanceTimersByTime(10000);
    expect(_toasts().length).toBe(2);
  });

  it("_resumeAll restarts timers with remaining time", () => {
    toast("Hello", { duration: 4000 });

    vi.advanceTimersByTime(3000); // 1000ms remaining
    _pauseAll();

    vi.advanceTimersByTime(5000); // paused, nothing happens
    expect(_toasts().length).toBe(1);

    _resumeAll();

    vi.advanceTimersByTime(999); // almost there
    expect(_toasts().length).toBe(1);

    vi.advanceTimersByTime(1); // now it fires
    expect(_toasts().length).toBe(0);
  });

  it("_pauseAll is no-op for persistent toasts (duration 0)", () => {
    toast("Persistent", { duration: 0 });

    _pauseAll();
    _resumeAll();

    vi.advanceTimersByTime(10000);
    expect(_toasts().length).toBe(1);
  });

  it("_resumeAll is no-op when no toasts are paused", () => {
    toast("Hello", { duration: 4000 });

    // Call resume without pause — should not cause issues
    _resumeAll();

    vi.advanceTimersByTime(4000);
    expect(_toasts().length).toBe(0);
  });
});

describe("max queue behavior", () => {
  it("adding more toasts than max still stores all in _toasts", () => {
    // The Toaster component limits visible toasts via computed slice,
    // but the underlying signal holds all toasts
    for (let i = 0; i < 10; i++) {
      toast(`Toast ${i}`, { duration: 0 });
    }
    expect(_toasts().length).toBe(10);
  });

  it("each toast gets a unique id", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(toast(`Toast ${i}`, { duration: 0 }));
    }
    expect(ids.size).toBe(20);
  });
});

describe("toast.promise with rejected promise", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses function error handler with error argument", async () => {
    const err = new Error("network failure");
    const promise = Promise.reject(err);

    toast
      .promise(promise, {
        loading: "Saving...",
        success: "Saved!",
        error: (e: unknown) => `Failed: ${(e as Error).message}`,
      })
      .catch(() => {});

    try {
      await promise;
    } catch {
      // expected
    }

    await vi.advanceTimersByTimeAsync(0);

    expect(at(0).message).toBe("Failed: network failure");
    expect(at(0).type).toBe("error");
  });

  it("resolved promise toast gets auto-dismiss timer", async () => {
    const promise = Promise.resolve("ok");

    toast.promise(promise, {
      loading: "Loading...",
      success: "Done!",
      error: "Failed",
    });

    // Loading toast is persistent (duration 0)
    expect(at(0).duration).toBe(0);

    await promise;
    await vi.advanceTimersByTimeAsync(0);

    // After resolve, toast gets default duration (4000ms)
    expect(at(0).duration).toBe(4000);

    vi.advanceTimersByTime(4000);
    expect(_toasts().length).toBe(0);
  });

  it("rejected promise toast gets auto-dismiss timer", async () => {
    const promise = Promise.reject(new Error("fail"));

    toast
      .promise(promise, {
        loading: "Loading...",
        success: "Done!",
        error: "Failed",
      })
      .catch(() => {});

    try {
      await promise;
    } catch {
      // expected
    }
    await vi.advanceTimersByTimeAsync(0);

    expect(at(0).duration).toBe(4000);
    expect(at(0).type).toBe("error");

    vi.advanceTimersByTime(4000);
    expect(_toasts().length).toBe(0);
  });
});

describe("dismiss callback behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("onDismiss is called on auto-dismiss timeout", () => {
    const onDismiss = vi.fn();
    toast("Hello", { onDismiss, duration: 2000 });

    vi.advanceTimersByTime(2000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("onDismiss is not called twice on manual dismiss after timeout", () => {
    const onDismiss = vi.fn();
    const id = toast("Hello", { onDismiss, duration: 2000 });

    toast.dismiss(id);
    expect(onDismiss).toHaveBeenCalledOnce();

    // The timeout timer was cleared, so it should not fire again
    vi.advanceTimersByTime(2000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("onDismiss is called for each toast when dismissing all", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    const callbacks = [cb1, cb2, cb3];
    toast("A", { onDismiss: cb1, duration: 0 });
    toast("B", { onDismiss: cb2, duration: 0 });
    toast("C", { onDismiss: cb3, duration: 0 });

    toast.dismiss();

    for (const cb of callbacks) {
      expect(cb).toHaveBeenCalledOnce();
    }
  });
});

describe("toast initial state", () => {
  it("toast starts in entering state", () => {
    toast("Hello");
    expect(at(0).state).toBe("entering");
  });

  it("toast has correct initial timer fields", () => {
    toast("Hello", { duration: 4000 });
    const t = at(0);
    expect(t.remaining).toBe(4000);
    expect(t.timerStart).toBeGreaterThan(0);
    expect(t.timer).toBeDefined();
  });

  it("persistent toast has no timer", () => {
    toast("Hello", { duration: 0 });
    const t = at(0);
    expect(t.timer).toBeUndefined();
  });
});

describe("Toaster renders", () => {
  it("Toaster is a function component", async () => {
    const { Toaster } = await import("../toaster");
    expect(typeof Toaster).toBe("function");
  });
});
