import { signal } from "@pyreon/reactivity";
import { describe, expect, it, vi } from "vitest";
import { createMachine } from "../index";

describe("createMachine — guard conditions", () => {
  it("transitions when guard returns true", () => {
    const m = createMachine({
      initial: "editing",
      states: {
        editing: {
          on: { SUBMIT: { target: "submitting", guard: () => true } },
        },
        submitting: {},
      },
    });
    m.send("SUBMIT");
    expect(m()).toBe("submitting");
  });

  it("blocks transition when guard returns false", () => {
    const m = createMachine({
      initial: "editing",
      states: {
        editing: {
          on: { SUBMIT: { target: "submitting", guard: () => false } },
        },
        submitting: {},
      },
    });
    m.send("SUBMIT");
    expect(m()).toBe("editing");
  });

  it("guard receives event payload", () => {
    const guardFn = vi.fn((payload?: unknown) => {
      return (payload as any)?.amount > 0;
    });

    const m = createMachine({
      initial: "idle",
      states: {
        idle: {
          on: { PAY: { target: "processing", guard: guardFn } },
        },
        processing: {},
      },
    });

    m.send("PAY", { amount: 0 });
    expect(m()).toBe("idle");
    expect(guardFn).toHaveBeenCalledWith({ amount: 0 });

    m.send("PAY", { amount: 100 });
    expect(m()).toBe("processing");
    expect(guardFn).toHaveBeenCalledWith({ amount: 100 });
  });

  it("guard without payload receives undefined", () => {
    const guardFn = vi.fn(() => true);

    const m = createMachine({
      initial: "idle",
      states: {
        idle: {
          on: { GO: { target: "active", guard: guardFn } },
        },
        active: {},
      },
    });

    m.send("GO");
    expect(guardFn).toHaveBeenCalledWith(undefined);
  });

  it("guard with reactive signal dependency", () => {
    const isValid = signal(false);

    const m = createMachine({
      initial: "editing",
      states: {
        editing: {
          on: {
            SUBMIT: { target: "submitting", guard: () => isValid.peek() },
          },
        },
        submitting: {},
      },
    });

    m.send("SUBMIT");
    expect(m()).toBe("editing"); // guard blocks

    isValid.set(true);
    m.send("SUBMIT");
    expect(m()).toBe("submitting"); // guard passes
  });

  it("guard can check multiple conditions", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: {
          on: {
            START: {
              target: "running",
              guard: (payload?: unknown) => {
                const p = payload as { ready: boolean; count: number } | undefined;
                return p !== undefined && p.ready && p.count > 0;
              },
            },
          },
        },
        running: {},
      },
    });

    m.send("START", { ready: false, count: 5 });
    expect(m()).toBe("idle");

    m.send("START", { ready: true, count: 0 });
    expect(m()).toBe("idle");

    m.send("START", { ready: true, count: 5 });
    expect(m()).toBe("running");
  });

  it("different events on same state can have different guards", () => {
    const m = createMachine({
      initial: "editing",
      states: {
        editing: {
          on: {
            SAVE: { target: "saved", guard: () => true },
            PUBLISH: { target: "published", guard: () => false },
          },
        },
        saved: {},
        published: {},
      },
    });

    m.send("PUBLISH");
    expect(m()).toBe("editing"); // guard blocks

    m.send("SAVE");
    expect(m()).toBe("saved"); // guard passes
  });

  it("guard blocks do not fire onEnter or onTransition", () => {
    const m = createMachine({
      initial: "a",
      states: {
        a: { on: { GO: { target: "b", guard: () => false } } },
        b: {},
      },
    });

    const enterFn = vi.fn();
    const transitionFn = vi.fn();
    m.onEnter("b", enterFn);
    m.onTransition(transitionFn);

    m.send("GO");
    expect(enterFn).not.toHaveBeenCalled();
    expect(transitionFn).not.toHaveBeenCalled();
  });

  it("mixing guarded and non-guarded transitions", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: {
          on: {
            FETCH: "loading", // no guard
            ADMIN: { target: "admin", guard: () => false }, // guarded
          },
        },
        loading: {},
        admin: {},
      },
    });

    m.send("ADMIN");
    expect(m()).toBe("idle"); // blocked

    m.send("FETCH");
    expect(m()).toBe("loading"); // no guard, passes
  });
});
