import {
  defineComponent,
  dispatchToErrorBoundary,
  popErrorBoundary,
  propagateError,
  pushErrorBoundary,
  runWithHooks,
} from "../component";
import { h } from "../h";
import { onErrorCaptured, onMount, onUnmount, onUpdate } from "../lifecycle";
import type { ComponentFn, LifecycleHooks, VNode } from "../types";

describe("defineComponent", () => {
  test("returns the exact same function (identity)", () => {
    const fn: ComponentFn = () => h("div", null);
    expect(defineComponent(fn)).toBe(fn);
  });

  test("preserves typed props", () => {
    const Comp = defineComponent<{ count: number }>((props) => {
      return h("span", null, String(props.count));
    });
    const node = Comp({ count: 10 });
    expect((node as VNode).type).toBe("span");
  });
});

describe("runWithHooks", () => {
  test("captures all lifecycle hook types", () => {
    const mountFn = () => undefined;
    const unmountFn = () => {};
    const updateFn = () => {};
    const errorFn = () => true;

    const Comp: ComponentFn = () => {
      onMount(mountFn);
      onUnmount(unmountFn);
      onUpdate(updateFn);
      onErrorCaptured(errorFn);
      return h("div", null);
    };

    const { vnode, hooks } = runWithHooks(Comp, {});
    expect(vnode).not.toBeNull();
    expect(hooks.mount).toContain(mountFn);
    expect(hooks.unmount).toContain(unmountFn);
    expect(hooks.update).toContain(updateFn);
    expect(hooks.error).toContain(errorFn);
  });

  test("returns null vnode for component returning null", () => {
    const { vnode } = runWithHooks(() => null, {});
    expect(vnode).toBeNull();
  });

  test("returns string vnode for component returning string", () => {
    const { vnode } = runWithHooks(() => "hello", {});
    expect(vnode).toBe("hello");
  });

  test("clears hooks context after execution", () => {
    const Comp: ComponentFn = () => h("div", null);
    runWithHooks(Comp, {});
    // After runWithHooks, lifecycle hooks should be no-ops
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    onMount(() => {});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("clears hooks context even when component throws", () => {
    const Comp: ComponentFn = () => {
      throw new Error("boom");
    };
    expect(() => runWithHooks(Comp, {})).toThrow("boom");
    // Should still be cleared
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    onMount(() => {});
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("passes props to component function", () => {
    let received: unknown = null;
    runWithHooks(
      ((props: { msg: string }) => {
        received = props;
        return null;
      }) as ComponentFn,
      { msg: "hello" },
    );
    expect(received).toEqual({ msg: "hello" });
  });

  test("captures multiple hooks of same type", () => {
    const Comp: ComponentFn = () => {
      onMount(() => undefined);
      onMount(() => undefined);
      onUnmount(() => {});
      onUnmount(() => {});
      return null;
    };
    const { hooks } = runWithHooks(Comp, {});
    expect(hooks.mount).toHaveLength(2);
    expect(hooks.unmount).toHaveLength(2);
  });

  test("empty hooks when component registers none", () => {
    const { hooks } = runWithHooks(() => h("div", null), {});
    expect(hooks.mount).toHaveLength(0);
    expect(hooks.unmount).toHaveLength(0);
    expect(hooks.update).toHaveLength(0);
    expect(hooks.error).toHaveLength(0);
  });
});

describe("propagateError", () => {
  test("returns true when handler returns true", () => {
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [() => true],
    };
    expect(propagateError(new Error("test"), hooks)).toBe(true);
  });

  test("returns false when no handlers", () => {
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [],
    };
    expect(propagateError(new Error("test"), hooks)).toBe(false);
  });

  test("returns false when handler returns undefined", () => {
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [() => undefined],
    };
    expect(propagateError(new Error("test"), hooks)).toBe(false);
  });

  test("stops at first handler returning true", () => {
    let secondCalled = false;
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [
        () => true,
        () => {
          secondCalled = true;
          return true;
        },
      ],
    };
    expect(propagateError("err", hooks)).toBe(true);
    expect(secondCalled).toBe(false);
  });

  test("continues to next handler when first returns undefined", () => {
    const calls: number[] = [];
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [
        () => {
          calls.push(1);
          return undefined;
        },
        () => {
          calls.push(2);
          return true;
        },
      ],
    };
    expect(propagateError("err", hooks)).toBe(true);
    expect(calls).toEqual([1, 2]);
  });

  test("passes the error to each handler", () => {
    const errors: unknown[] = [];
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [
        (err) => {
          errors.push(err);
          return undefined;
        },
        (err) => {
          errors.push(err);
          return true;
        },
      ],
    };
    const testErr = new Error("propagated");
    propagateError(testErr, hooks);
    expect(errors).toEqual([testErr, testErr]);
  });
});

describe("pushErrorBoundary / popErrorBoundary / dispatchToErrorBoundary", () => {
  afterEach(() => {
    // Clean up any leftover boundaries — pop until empty
    // dispatchToErrorBoundary returns false when stack is empty
    while (dispatchToErrorBoundary("cleanup-probe")) {
      popErrorBoundary();
    }
  });

  test("dispatches to the most recently pushed boundary", () => {
    let caught: unknown = null;
    pushErrorBoundary((err) => {
      caught = err;
      return true;
    });
    expect(dispatchToErrorBoundary("test-error")).toBe(true);
    expect(caught).toBe("test-error");
    popErrorBoundary();
  });

  test("returns false when no boundary is registered", () => {
    expect(dispatchToErrorBoundary("no-boundary")).toBe(false);
  });

  test("nested boundaries — innermost catches first", () => {
    const caught: string[] = [];
    pushErrorBoundary((err) => {
      caught.push(`outer: ${err}`);
      return true;
    });
    pushErrorBoundary((err) => {
      caught.push(`inner: ${err}`);
      return true;
    });
    dispatchToErrorBoundary("test");
    expect(caught).toEqual(["inner: test"]);
    popErrorBoundary();

    // After popping inner, outer should catch
    dispatchToErrorBoundary("test2");
    expect(caught).toEqual(["inner: test", "outer: test2"]);
    popErrorBoundary();
  });

  test("boundary handler returning false does not propagate to outer", () => {
    // dispatchToErrorBoundary only calls the innermost handler
    let outerCalled = false;
    pushErrorBoundary(() => {
      outerCalled = true;
      return true;
    });
    pushErrorBoundary(() => false);
    const result = dispatchToErrorBoundary("test");
    expect(result).toBe(false);
    expect(outerCalled).toBe(false); // outer not called — only innermost is checked
    popErrorBoundary();
    popErrorBoundary();
  });

  test("push and pop maintain stack correctly", () => {
    const results: boolean[] = [];
    pushErrorBoundary(() => true);
    pushErrorBoundary(() => true);
    pushErrorBoundary(() => true);
    popErrorBoundary();
    popErrorBoundary();
    results.push(dispatchToErrorBoundary("x"));
    popErrorBoundary();
    results.push(dispatchToErrorBoundary("y"));
    expect(results).toEqual([true, false]);
  });
});
