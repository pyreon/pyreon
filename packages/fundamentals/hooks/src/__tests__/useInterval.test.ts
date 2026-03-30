import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInterval } from "../useInterval";

// Mock onUnmount since it requires component lifecycle context
vi.mock("@pyreon/core", () => ({
  onMount: (fn: () => void) => fn(),
  onUnmount: (_fn: () => void) => {
    /* no-op */
  },
}));

describe("useInterval", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls callback at the specified interval", () => {
    const fn = vi.fn();
    useInterval(fn, 100);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not call callback when delay is null", () => {
    const fn = vi.fn();
    useInterval(fn, null);

    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("calls the latest callback", () => {
    let value = 0;
    let currentCb = () => {
      value = 1;
    };
    useInterval(() => currentCb(), 100);

    currentCb = () => {
      value = 2;
    };
    vi.advanceTimersByTime(100);
    expect(value).toBe(2);
  });
});
