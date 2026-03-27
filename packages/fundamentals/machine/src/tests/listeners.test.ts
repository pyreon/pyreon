import { describe, expect, it, vi } from "vitest"
import { createMachine } from "../index"

describe("createMachine — onEnter callbacks", () => {
  it("fires callback when entering the specified state", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: { on: { LOAD: "loading" } },
        loading: { on: { DONE: "idle" } },
      },
    })
    const entered: string[] = []

    m.onEnter("loading", (event) => {
      entered.push(event.type)
    })

    m.send("LOAD")
    expect(entered).toEqual(["LOAD"])
  })

  it("does not fire for other state entries", () => {
    const m = createMachine({
      initial: "a",
      states: {
        a: { on: { GO: "b" } },
        b: { on: { GO: "c" } },
        c: {},
      },
    })
    const fn = vi.fn()
    m.onEnter("c", fn)

    m.send("GO") // a -> b
    expect(fn).not.toHaveBeenCalled()

    m.send("GO") // b -> c
    expect(fn).toHaveBeenCalledOnce()
  })

  it("receives event payload", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: { on: { SELECT: "selected" } },
        selected: {},
      },
    })
    let received: unknown = null

    m.onEnter("selected", (event) => {
      received = event.payload
    })

    m.send("SELECT", { id: 42, name: "item" })
    expect(received).toEqual({ id: 42, name: "item" })
  })

  it("fires on self-transitions", () => {
    const m = createMachine({
      initial: "counting",
      states: {
        counting: { on: { INC: "counting" } },
      },
    })
    const fn = vi.fn()
    m.onEnter("counting", fn)

    m.send("INC")
    m.send("INC")
    m.send("INC")

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("unsubscribe function stops future callbacks", () => {
    const m = createMachine({
      initial: "a",
      states: {
        a: { on: { GO: "b" } },
        b: { on: { GO: "a" } },
      },
    })
    const fn = vi.fn()
    const unsub = m.onEnter("b", fn)

    m.send("GO") // a -> b
    expect(fn).toHaveBeenCalledOnce()

    unsub()

    m.send("GO") // b -> a
    m.send("GO") // a -> b again
    expect(fn).toHaveBeenCalledOnce() // not called again
  })

  it("multiple listeners for same state all fire", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: { on: { GO: "active" } },
        active: {},
      },
    })
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    const fn3 = vi.fn()

    m.onEnter("active", fn1)
    m.onEnter("active", fn2)
    m.onEnter("active", fn3)

    m.send("GO")
    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()
    expect(fn3).toHaveBeenCalledOnce()
  })

  it("onEnter for a state that is never entered is never called", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: { on: { GO: "active" } },
        active: {},
        unreachable: {},
      },
    })
    const fn = vi.fn()
    m.onEnter("unreachable", fn)

    m.send("GO")
    expect(fn).not.toHaveBeenCalled()
  })
})

describe("createMachine — onTransition callbacks", () => {
  it("fires on every state transition", () => {
    const m = createMachine({
      initial: "a",
      states: {
        a: { on: { NEXT: "b" } },
        b: { on: { NEXT: "c" } },
        c: {},
      },
    })
    const transitions: [string, string, string][] = []

    m.onTransition((from, to, event) => {
      transitions.push([from, to, event.type])
    })

    m.send("NEXT") // a -> b
    m.send("NEXT") // b -> c

    expect(transitions).toEqual([
      ["a", "b", "NEXT"],
      ["b", "c", "NEXT"],
    ])
  })

  it("does not fire when event is ignored (no valid transition)", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: { on: { START: "running" } },
        running: {},
      },
    })
    const fn = vi.fn()
    m.onTransition(fn)

    m.send("STOP" as any) // invalid
    expect(fn).not.toHaveBeenCalled()
  })

  it("does not fire when guard blocks transition", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: {
          on: { GO: { target: "active", guard: () => false } },
        },
        active: {},
      },
    })
    const fn = vi.fn()
    m.onTransition(fn)

    m.send("GO")
    expect(fn).not.toHaveBeenCalled()
  })

  it("receives event payload", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: { on: { LOAD: "loading" } },
        loading: {},
      },
    })
    let receivedPayload: unknown = null

    m.onTransition((_from, _to, event) => {
      receivedPayload = event.payload
    })

    m.send("LOAD", { url: "/api/data" })
    expect(receivedPayload).toEqual({ url: "/api/data" })
  })

  it("fires on self-transitions", () => {
    const m = createMachine({
      initial: "counting",
      states: {
        counting: { on: { INC: "counting" } },
      },
    })
    const fn = vi.fn()
    m.onTransition(fn)

    m.send("INC")
    m.send("INC")

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(
      "counting",
      "counting",
      expect.objectContaining({ type: "INC" }),
    )
  })

  it("unsubscribe stops future callbacks", () => {
    const m = createMachine({
      initial: "a",
      states: {
        a: { on: { GO: "b" } },
        b: { on: { GO: "a" } },
      },
    })
    const fn = vi.fn()
    const unsub = m.onTransition(fn)

    m.send("GO")
    expect(fn).toHaveBeenCalledOnce()

    unsub()
    m.send("GO")
    m.send("GO")
    expect(fn).toHaveBeenCalledOnce()
  })

  it("multiple transition listeners all fire", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: { on: { GO: "active" } },
        active: {},
      },
    })
    const fn1 = vi.fn()
    const fn2 = vi.fn()

    m.onTransition(fn1)
    m.onTransition(fn2)

    m.send("GO")
    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()
  })

  it("onTransition fires before onEnter", () => {
    const m = createMachine({
      initial: "idle",
      states: {
        idle: { on: { GO: "active" } },
        active: {},
      },
    })
    const order: string[] = []

    m.onTransition(() => order.push("transition"))
    m.onEnter("active", () => order.push("enter"))

    m.send("GO")
    expect(order).toEqual(["transition", "enter"])
  })
})
