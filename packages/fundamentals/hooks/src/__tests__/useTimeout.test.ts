import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimeout } from "../useTimeout";

// Mock onUnmount since it requires component lifecycle context
vi.mock("@pyreon/core", () => ({
  onMount: (fn: () => void) => fn(),
  onUnmount: (_fn: () => void) => {
    /* no-op */
  },
}));

describe("useTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls callback after delay", () => {
    const fn = vi.fn();
    useTimeout(fn, 200);

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not call callback when delay is null", () => {
    const fn = vi.fn();
    useTimeout(fn, null);

    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("clear() prevents the callback", () => {
    const fn = vi.fn();
    const { clear } = useTimeout(fn, 200);

    clear();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it("reset() restarts the timer", () => {
    const fn = vi.fn();
    const { reset } = useTimeout(fn, 200);

    vi.advanceTimersByTime(150);
    reset();

    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
