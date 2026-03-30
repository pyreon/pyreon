import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@pyreon/core", () => ({
  onMount: (_fn: () => unknown) => {
    /* no-op */
  },
  onUnmount: (_fn: () => void) => {
    /* no-op */
  },
}));

describe("useScrollLock", () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  async function getUseScrollLock() {
    // Re-mock after resetModules
    vi.doMock("@pyreon/core", () => ({
      onMount: (_fn: () => unknown) => {
        /* no-op */
      },
      onUnmount: (_fn: () => void) => {
        /* no-op */
      },
    }));
    const mod = await import("../useScrollLock");
    return mod.useScrollLock;
  }

  it("sets overflow to hidden when locked", async () => {
    const useScrollLock = await getUseScrollLock();
    const { lock } = useScrollLock();
    lock();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("does not change overflow until lock is called", async () => {
    const useScrollLock = await getUseScrollLock();
    document.body.style.overflow = "auto";
    useScrollLock();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("restores overflow when unlocked", async () => {
    const useScrollLock = await getUseScrollLock();
    document.body.style.overflow = "auto";
    const { lock, unlock } = useScrollLock();
    lock();
    expect(document.body.style.overflow).toBe("hidden");
    unlock();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("lock is idempotent", async () => {
    const useScrollLock = await getUseScrollLock();
    const { lock, unlock } = useScrollLock();
    lock();
    lock(); // second call should be no-op
    expect(document.body.style.overflow).toBe("hidden");
    unlock();
    expect(document.body.style.overflow).toBe("");
  });

  it("unlock is idempotent", async () => {
    const useScrollLock = await getUseScrollLock();
    const { lock, unlock } = useScrollLock();
    lock();
    unlock();
    unlock(); // second call should be no-op
    expect(document.body.style.overflow).toBe("");
  });

  it("handles concurrent locks with reference counting", async () => {
    const useScrollLock = await getUseScrollLock();
    const lock1 = useScrollLock();
    const lock2 = useScrollLock();

    lock1.lock();
    expect(document.body.style.overflow).toBe("hidden");

    lock2.lock();
    expect(document.body.style.overflow).toBe("hidden");

    // Unlocking first should not restore (still 1 active)
    lock1.unlock();
    expect(document.body.style.overflow).toBe("hidden");

    // Unlocking second should restore
    lock2.unlock();
    expect(document.body.style.overflow).toBe("");
  });

  it("preserves original overflow across concurrent locks", async () => {
    const useScrollLock = await getUseScrollLock();
    document.body.style.overflow = "scroll";

    const lock1 = useScrollLock();
    const lock2 = useScrollLock();

    lock1.lock();
    lock2.lock();

    lock1.unlock();
    expect(document.body.style.overflow).toBe("hidden");

    lock2.unlock();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("unlock without prior lock is no-op", async () => {
    const useScrollLock = await getUseScrollLock();
    document.body.style.overflow = "auto";
    const { unlock } = useScrollLock();
    unlock();
    expect(document.body.style.overflow).toBe("auto");
  });
});
