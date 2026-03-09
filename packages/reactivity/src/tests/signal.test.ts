import { describe, expect, test } from "bun:test"
import { effect } from "../effect"
import { signal } from "../signal"

describe("signal", () => {
  test("reads initial value", () => {
    const s = signal(42)
    expect(s()).toBe(42)
  })

  test("set updates value", () => {
    const s = signal(0)
    s.set(10)
    expect(s()).toBe(10)
  })

  test("update transforms value", () => {
    const s = signal(5)
    s.update((n) => n * 2)
    expect(s()).toBe(10)
  })

  test("set with same value does not notify", () => {
    const s = signal(1)
    let calls = 0
    effect(() => {
      s() // track
      calls++
    })
    expect(calls).toBe(1) // initial run
    s.set(1) // same value — no notification
    expect(calls).toBe(1)
    s.set(2) // different value — notifies
    expect(calls).toBe(2)
  })

  test("works with objects", () => {
    const s = signal({ x: 1 })
    s.update((o) => ({ ...o, x: 2 }))
    expect(s().x).toBe(2)
  })

  test("works with null and undefined", () => {
    const s = signal<string | null>(null)
    expect(s()).toBeNull()
    s.set("hello")
    expect(s()).toBe("hello")
  })

  test("peek reads value without tracking", () => {
    const s = signal(42)
    let count = 0
    effect(() => {
      s.peek() // should NOT track
      count++
    })
    expect(count).toBe(1)
    s.set(100)
    expect(count).toBe(1) // no re-run because peek doesn't track
    expect(s.peek()).toBe(100)
  })

  test("subscribe adds a static listener", () => {
    const s = signal(0)
    let notified = 0
    const unsub = s.subscribe(() => { notified++ })

    s.set(1)
    expect(notified).toBe(1)
    s.set(2)
    expect(notified).toBe(2)

    unsub()
    s.set(3)
    expect(notified).toBe(2) // unsubscribed
  })

  test("subscribe disposer is safe to call multiple times", () => {
    const s = signal(0)
    const unsub = s.subscribe(() => {})
    unsub()
    unsub() // should not throw
  })
})
