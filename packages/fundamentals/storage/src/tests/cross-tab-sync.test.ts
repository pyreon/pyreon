import { effect } from "@pyreon/reactivity"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { _resetRegistry, useStorage } from "../index"

/**
 * Tests for cross-tab synchronization via the native `storage` event.
 * These test the listener that useStorage attaches to `window.addEventListener('storage', ...)`.
 */
describe("useStorage — cross-tab sync", () => {
  beforeEach(() => {
    localStorage.clear()
    _resetRegistry()
  })

  afterEach(() => {
    localStorage.clear()
    _resetRegistry()
  })

  it("updates signal when storage event fires with a new value", () => {
    const theme = useStorage("theme", "light")
    expect(theme()).toBe("light")

    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "theme",
        newValue: JSON.stringify("dark"),
        storageArea: localStorage,
      }),
    )

    expect(theme()).toBe("dark")
  })

  it("resets to default when storage event fires with null newValue (key deleted)", () => {
    const theme = useStorage("theme", "light")
    theme.set("dark")
    expect(theme()).toBe("dark")

    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "theme",
        newValue: null,
        storageArea: localStorage,
      }),
    )

    expect(theme()).toBe("light")
  })

  it("ignores storage events for unregistered keys", () => {
    const theme = useStorage("theme", "light")

    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "unrelated-key",
        newValue: JSON.stringify("value"),
        storageArea: localStorage,
      }),
    )

    expect(theme()).toBe("light")
  })

  it("ignores storage events with null key", () => {
    const theme = useStorage("theme", "light")

    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: null,
        newValue: null,
        storageArea: localStorage,
      }),
    )

    expect(theme()).toBe("light")
  })

  it("triggers reactive effect on cross-tab update", () => {
    const theme = useStorage("theme", "light")
    const values: string[] = []

    effect(() => {
      values.push(theme())
    })

    expect(values).toEqual(["light"])

    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "theme",
        newValue: JSON.stringify("dark"),
        storageArea: localStorage,
      }),
    )

    expect(values).toEqual(["light", "dark"])
  })

  it("handles corrupt JSON in storage event gracefully (falls back to default)", () => {
    const count = useStorage("count", 0)

    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "count",
        newValue: "{invalid json",
        storageArea: localStorage,
      }),
    )

    // deserialize falls back to defaultValue on parse error
    expect(count()).toBe(0)
  })

  it("syncs object values across tabs", () => {
    const prefs = useStorage("prefs", { sidebar: true, density: "comfortable" })

    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "prefs",
        newValue: JSON.stringify({ sidebar: false, density: "compact" }),
        storageArea: localStorage,
      }),
    )

    expect(prefs()).toEqual({ sidebar: false, density: "compact" })
  })

  it("handles multiple rapid storage events", () => {
    const count = useStorage("count", 0)

    for (let i = 1; i <= 5; i++) {
      window.dispatchEvent(
        Object.assign(new Event("storage"), {
          key: "count",
          newValue: JSON.stringify(i),
          storageArea: localStorage,
        }),
      )
    }

    expect(count()).toBe(5)
  })

  it("cross-tab sync works independently for different keys", () => {
    const theme = useStorage("theme", "light")
    const lang = useStorage("lang", "en")

    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "theme",
        newValue: JSON.stringify("dark"),
        storageArea: localStorage,
      }),
    )

    expect(theme()).toBe("dark")
    expect(lang()).toBe("en") // unchanged
  })
})
