import { _notifyTraceListeners, inspectSignal, isTracing, onSignalUpdate, why } from "../debug"
import { signal } from "../signal"

describe("debug", () => {
  describe("onSignalUpdate / isTracing", () => {
    test("isTracing is false by default", () => {
      expect(isTracing()).toBe(false)
    })

    test("registering a listener enables tracing", () => {
      const dispose = onSignalUpdate(() => {})
      expect(isTracing()).toBe(true)
      dispose()
      expect(isTracing()).toBe(false)
    })

    test("listener receives signal update events", () => {
      const events: { name: string | undefined; prev: unknown; next: unknown }[] = []
      const dispose = onSignalUpdate((e) => {
        events.push({ name: e.name, prev: e.prev, next: e.next })
      })

      const s = signal(1, { name: "count" })
      s.set(2)

      expect(events.length).toBe(1)
      expect(events[0]).toEqual({ name: "count", prev: 1, next: 2 })

      dispose()
    })

    test("dispose removes only the specific listener", () => {
      let calls1 = 0
      let calls2 = 0
      const dispose1 = onSignalUpdate(() => calls1++)
      const dispose2 = onSignalUpdate(() => calls2++)

      const s = signal(0)
      s.set(1)
      expect(calls1).toBe(1)
      expect(calls2).toBe(1)

      dispose1()

      s.set(2)
      expect(calls1).toBe(1) // removed
      expect(calls2).toBe(2) // still active

      dispose2()
      expect(isTracing()).toBe(false)
    })

    test("dispose is safe to call when listeners already null", () => {
      const dispose = onSignalUpdate(() => {})
      dispose()
      expect(isTracing()).toBe(false)
      dispose() // should not throw — _traceListeners is null
    })

    test("_notifyTraceListeners does nothing when no listeners", () => {
      const s = signal(0)
      // Should not throw
      _notifyTraceListeners(s, 0, 1)
    })

    test("event includes stack and timestamp", () => {
      let event: { stack: string; timestamp: number } | undefined
      const dispose = onSignalUpdate((e) => {
        event = { stack: e.stack, timestamp: e.timestamp }
      })

      const s = signal(0)
      s.set(1)

      expect(event).toBeDefined()
      expect(typeof event?.stack).toBe("string")
      expect(typeof event?.timestamp).toBe("number")

      dispose()
    })
  })

  describe("why", () => {
    test("logs signal updates to console", async () => {
      const logs: unknown[][] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => logs.push(args)

      const s = signal(1, { name: "test" })
      why()
      s.set(2)

      // Wait for microtask (auto-dispose)
      await new Promise((r) => queueMicrotask(() => r(undefined)))

      expect(logs.length).toBeGreaterThan(0)
      console.log = origLog
    })

    test("logs 'no updates' when nothing changes", async () => {
      const logs: unknown[][] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => logs.push(args)

      why()
      // No signal updates

      await new Promise((r) => queueMicrotask(() => r(undefined)))

      const noUpdateLog =
        logs.find((args) =>
          typeof args[0] === "string" ? args[0].includes("No signal") : false,
        ) ||
        logs.find((args) => (typeof args[1] === "string" ? args[1].includes("No signal") : false))
      expect(noUpdateLog).toBeDefined()
      console.log = origLog
    })

    test("calling why() twice is ignored (already active)", async () => {
      const logs: unknown[][] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => logs.push(args)

      why()
      why() // should be ignored
      const s = signal(0, { name: "x" })
      s.set(1)

      await new Promise((r) => queueMicrotask(() => r(undefined)))
      // Should not throw or double-log
      console.log = origLog
    })

    test("logs anonymous signal name when no name is set", async () => {
      const logs: unknown[][] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => logs.push(args)

      const s = signal(0) // no name
      why()
      s.set(1)

      await new Promise((r) => queueMicrotask(() => r(undefined)))

      const anonLog = logs.find((args) =>
        args.some((a) => typeof a === "string" && a.includes("anonymous")),
      )
      expect(anonLog).toBeDefined()
      console.log = origLog
    })
  })

  describe("inspectSignal", () => {
    test("prints signal info and returns debug info", () => {
      const groupCalls: unknown[][] = []
      const logCalls: unknown[][] = []
      const origGroup = console.group
      const origLog = console.log
      const origEnd = console.groupEnd
      console.group = (...args: unknown[]) => groupCalls.push(args)
      console.log = (...args: unknown[]) => logCalls.push(args)
      console.groupEnd = () => {}

      const s = signal(42, { name: "count" })
      const info = inspectSignal(s)

      expect(info.name).toBe("count")
      expect(info.value).toBe(42)
      expect(info.subscriberCount).toBe(0)
      expect(groupCalls.length).toBe(1)
      expect(logCalls.length).toBe(2) // value + subscribers

      console.group = origGroup
      console.log = origLog
      console.groupEnd = origEnd
    })

    test("handles anonymous signal", () => {
      const origGroup = console.group
      const origLog = console.log
      const origEnd = console.groupEnd
      console.group = () => {}
      console.log = () => {}
      console.groupEnd = () => {}

      const s = signal(0)
      const info = inspectSignal(s)

      expect(info.name).toBeUndefined()

      console.group = origGroup
      console.log = origLog
      console.groupEnd = origEnd
    })
  })
})
