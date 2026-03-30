import { beforeEach, describe, expect, it, vi } from "vitest";

let mountCallbacks: Array<() => void> = [];
let unmountCallbacks: Array<() => void> = [];

vi.mock("@pyreon/core", () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(fn as () => void);
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn);
  },
}));

import { useKeyboard } from "../useKeyboard";

describe("useKeyboard", () => {
  beforeEach(() => {
    mountCallbacks = [];
    unmountCallbacks = [];
  });

  it("calls handler when the target key is pressed", () => {
    const handler = vi.fn();
    useKeyboard("Enter", handler);
    mountCallbacks.forEach((cb) => {
      cb();
    });

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    document.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not call handler for different keys", () => {
    const handler = vi.fn();
    useKeyboard("Enter", handler);
    mountCallbacks.forEach((cb) => {
      cb();
    });

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    document.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it("listens for keydown by default", () => {
    const handler = vi.fn();
    const addSpy = vi.spyOn(document, "addEventListener");
    useKeyboard("Escape", handler);
    mountCallbacks.forEach((cb) => {
      cb();
    });

    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    addSpy.mockRestore();
  });

  it("supports keyup event option", () => {
    const handler = vi.fn();
    useKeyboard("Space", handler, { event: "keyup" });
    mountCallbacks.forEach((cb) => {
      cb();
    });

    const keydownEvent = new KeyboardEvent("keydown", { key: "Space", bubbles: true });
    document.dispatchEvent(keydownEvent);
    expect(handler).not.toHaveBeenCalled();

    const keyupEvent = new KeyboardEvent("keyup", { key: "Space", bubbles: true });
    document.dispatchEvent(keyupEvent);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("supports custom target", () => {
    const handler = vi.fn();
    const customTarget = document.createElement("div");
    document.body.appendChild(customTarget);
    const addSpy = vi.spyOn(customTarget, "addEventListener");

    useKeyboard("Enter", handler, { target: customTarget });
    mountCallbacks.forEach((cb) => {
      cb();
    });

    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    customTarget.dispatchEvent(event);
    expect(handler).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
    document.body.removeChild(customTarget);
  });

  it("removes listeners on unmount", () => {
    const handler = vi.fn();
    const removeSpy = vi.spyOn(document, "removeEventListener");
    useKeyboard("Enter", handler);
    mountCallbacks.forEach((cb) => {
      cb();
    });
    unmountCallbacks.forEach((cb) => {
      cb();
    });

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("removes listeners from custom target on unmount", () => {
    const handler = vi.fn();
    const customTarget = document.createElement("div");
    const removeSpy = vi.spyOn(customTarget, "removeEventListener");

    useKeyboard("Enter", handler, { target: customTarget });
    mountCallbacks.forEach((cb) => {
      cb();
    });
    unmountCallbacks.forEach((cb) => {
      cb();
    });

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("calls handler multiple times for repeated key presses", () => {
    const handler = vi.fn();
    useKeyboard("a", handler);
    mountCallbacks.forEach((cb) => {
      cb();
    });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

    expect(handler).toHaveBeenCalledTimes(3);
  });
});
