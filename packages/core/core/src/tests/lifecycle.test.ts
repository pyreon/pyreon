import {
  getCurrentHooks,
  onErrorCaptured,
  onMount,
  onUnmount,
  onUpdate,
  setCurrentHooks,
} from "../lifecycle";
import type { LifecycleHooks } from "../types";

describe("setCurrentHooks / getCurrentHooks", () => {
  afterEach(() => {
    setCurrentHooks(null);
  });

  test("getCurrentHooks returns null by default", () => {
    expect(getCurrentHooks()).toBeNull();
  });

  test("setCurrentHooks sets the current hooks context", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    expect(getCurrentHooks()).toBe(hooks);
  });

  test("setCurrentHooks(null) clears the context", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    expect(getCurrentHooks()).toBe(hooks);
    setCurrentHooks(null);
    expect(getCurrentHooks()).toBeNull();
  });
});

describe("onMount", () => {
  afterEach(() => {
    setCurrentHooks(null);
  });

  test("registers callback on current hooks", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    const fn = () => undefined;
    onMount(fn);
    expect(hooks.mount).toHaveLength(1);
    expect(hooks.mount[0]).toBe(fn);
  });

  test("multiple onMount calls accumulate", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    onMount(() => undefined);
    onMount(() => undefined);
    onMount(() => undefined);
    expect(hooks.mount).toHaveLength(3);
  });

  test("warns when called outside component setup", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    onMount(() => {});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("onMount() called outside component setup"),
    );
    warnSpy.mockRestore();
  });

  test("is a no-op outside component setup (no crash)", () => {
    expect(() => onMount(() => {})).not.toThrow();
  });

  test("accepts callback returning cleanup function", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    const cleanup = () => {};
    onMount(() => cleanup);
    expect(hooks.mount).toHaveLength(1);
    expect(hooks.mount[0]!()).toBe(cleanup);
  });

  test("accepts callback returning void", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    onMount(() => {});
    expect(hooks.mount).toHaveLength(1);
    expect(hooks.mount[0]!()).toBeUndefined();
  });
});

describe("onUnmount", () => {
  afterEach(() => {
    setCurrentHooks(null);
  });

  test("registers callback on current hooks", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    const fn = () => {};
    onUnmount(fn);
    expect(hooks.unmount).toHaveLength(1);
    expect(hooks.unmount[0]).toBe(fn);
  });

  test("warns when called outside component setup", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    onUnmount(() => {});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("onUnmount() called outside component setup"),
    );
    warnSpy.mockRestore();
  });
});

describe("onUpdate", () => {
  afterEach(() => {
    setCurrentHooks(null);
  });

  test("registers callback on current hooks", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    const fn = () => {};
    onUpdate(fn);
    expect(hooks.update).toHaveLength(1);
    expect(hooks.update[0]).toBe(fn);
  });

  test("warns when called outside component setup", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    onUpdate(() => {});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("onUpdate() called outside component setup"),
    );
    warnSpy.mockRestore();
  });
});

describe("onErrorCaptured", () => {
  afterEach(() => {
    setCurrentHooks(null);
  });

  test("registers callback on current hooks", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    const fn = () => true;
    onErrorCaptured(fn);
    expect(hooks.error).toHaveLength(1);
    expect(hooks.error[0]).toBe(fn);
  });

  test("warns when called outside component setup", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    onErrorCaptured(() => true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("onErrorCaptured() called outside component setup"),
    );
    warnSpy.mockRestore();
  });

  test("registered handler receives the error", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);
    let captured: unknown = null;
    onErrorCaptured((err) => {
      captured = err;
      return true;
    });
    // Simulate calling the handler
    const testError = new Error("test");
    hooks.error[0]!(testError);
    expect(captured).toBe(testError);
  });
});

describe("lifecycle hooks interaction", () => {
  afterEach(() => {
    setCurrentHooks(null);
  });

  test("all hook types can be registered in same context", () => {
    const hooks: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    setCurrentHooks(hooks);

    onMount(() => undefined);
    onUnmount(() => {});
    onUpdate(() => {});
    onErrorCaptured(() => true);

    expect(hooks.mount).toHaveLength(1);
    expect(hooks.unmount).toHaveLength(1);
    expect(hooks.update).toHaveLength(1);
    expect(hooks.error).toHaveLength(1);
  });

  test("hooks from different setCurrentHooks calls go to different stores", () => {
    const hooks1: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };
    const hooks2: LifecycleHooks = { mount: [], unmount: [], update: [], error: [] };

    setCurrentHooks(hooks1);
    onMount(() => undefined);
    setCurrentHooks(hooks2);
    onMount(() => undefined);
    onMount(() => undefined);

    expect(hooks1.mount).toHaveLength(1);
    expect(hooks2.mount).toHaveLength(2);
  });
});
