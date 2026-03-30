import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  _resetRegistry,
  clearStorage,
  removeStorage,
  useCookie,
  useSessionStorage,
  useStorage,
} from "../index"

describe("removeStorage — comprehensive", () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    _resetRegistry()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    _resetRegistry()
  })

  it("removes localStorage entry and resets signal to default", () => {
    const theme = useStorage("theme", "light")
    theme.set("dark")
    removeStorage("theme")
    expect(theme()).toBe("light")
    expect(localStorage.getItem("theme")).toBeNull()
  })

  it("removes sessionStorage entry", () => {
    const step = useSessionStorage("step", 0)
    step.set(5)
    removeStorage("step", { type: "session" })
    expect(step()).toBe(0)
    expect(sessionStorage.getItem("step")).toBeNull()
  })

  it("removes cookie entry", () => {
    const locale = useCookie("locale", "en")
    locale.set("de")
    removeStorage("locale", { type: "cookie" })
    expect(locale()).toBe("en")
  })

  it("removes raw localStorage entry without a signal", () => {
    localStorage.setItem("orphan", "value")
    removeStorage("orphan")
    expect(localStorage.getItem("orphan")).toBeNull()
  })

  it("removes raw sessionStorage entry without a signal", () => {
    sessionStorage.setItem("orphan", "value")
    removeStorage("orphan", { type: "session" })
    expect(sessionStorage.getItem("orphan")).toBeNull()
  })

  it("removes cookie without a registered signal (no throw)", () => {
    expect(() => removeStorage("nonexistent", { type: "cookie" })).not.toThrow()
  })

  it("defaults to localStorage when no type specified", () => {
    localStorage.setItem("default-type", "val")
    removeStorage("default-type")
    expect(localStorage.getItem("default-type")).toBeNull()
  })

  it("after removeStorage, a new useStorage call creates fresh signal", () => {
    const a = useStorage("resettable", "first")
    a.set("modified")
    removeStorage("resettable")

    const b = useStorage("resettable", "second")
    expect(b()).toBe("second")
    expect(a).not.toBe(b)
  })
})

describe("clearStorage — comprehensive", () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    _resetRegistry()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    _resetRegistry()
  })

  it("clears all managed localStorage entries", () => {
    const a = useStorage("a", 1)
    const b = useStorage("b", 2)
    const c = useStorage("c", 3)
    a.set(10)
    b.set(20)
    c.set(30)

    clearStorage()
    expect(a()).toBe(1)
    expect(b()).toBe(2)
    expect(c()).toBe(3)
  })

  it("clears all managed sessionStorage entries", () => {
    const a = useSessionStorage("a", "x")
    const b = useSessionStorage("b", "y")
    a.set("modified-a")
    b.set("modified-b")

    clearStorage("session")
    expect(a()).toBe("x")
    expect(b()).toBe("y")
  })

  it("clears managed cookie entries", () => {
    const locale = useCookie("locale", "en")
    locale.set("de")

    clearStorage("cookie")
    expect(locale()).toBe("en")
  })

  it('clears all backends with "all"', () => {
    const local = useStorage("local-key", "default")
    const session = useSessionStorage("session-key", "default")
    const cookie = useCookie("cookie-key", "default")
    local.set("changed")
    session.set("changed")
    cookie.set("changed")

    clearStorage("all")
    expect(local()).toBe("default")
    expect(session()).toBe("default")
    expect(cookie()).toBe("default")
  })

  it("clearStorage with no managed entries does not throw", () => {
    expect(() => clearStorage()).not.toThrow()
    expect(() => clearStorage("session")).not.toThrow()
    expect(() => clearStorage("cookie")).not.toThrow()
    expect(() => clearStorage("indexeddb")).not.toThrow()
    expect(() => clearStorage("all")).not.toThrow()
  })

  it("clearStorage does not affect unmanaged entries", () => {
    localStorage.setItem("unmanaged", "value")
    const managed = useStorage("managed", "default")
    managed.set("changed")

    clearStorage()
    expect(managed()).toBe("default")
    // Unmanaged key should still exist (clearStorage only affects registered signals)
    expect(localStorage.getItem("unmanaged")).toBe("value")
  })
})
