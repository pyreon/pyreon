import { effect } from "@pyreon/reactivity"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useUrlState } from "../index"

/**
 * Helper: set window.location.search to a given query string.
 * happy-dom allows direct assignment to window.location properties.
 */
function setSearch(search: string) {
  const url = new URL(window.location.href)
  url.search = search
  history.replaceState(null, "", url.toString())
}

describe("useUrlState", () => {
  beforeEach(() => {
    setSearch("")
  })

  afterEach(() => {
    setSearch("")
  })

  // ── Single param ────────────────────────────────────────────────────────

  describe("single param mode", () => {
    it("returns default value when param is not in URL", () => {
      const page = useUrlState("page", 1)
      expect(page()).toBe(1)
    })

    it("reads initial value from URL", () => {
      setSearch("?page=5")
      const page = useUrlState("page", 1)
      expect(page()).toBe(5)
    })

    it(".set() updates signal and URL", () => {
      const page = useUrlState("page", 1)
      page.set(3)
      expect(page()).toBe(3)
      expect(new URLSearchParams(window.location.search).get("page")).toBe("3")
    })

    it(".reset() returns to default and cleans URL", () => {
      setSearch("?page=5")
      const page = useUrlState("page", 1)
      expect(page()).toBe(5)

      page.reset()
      expect(page()).toBe(1)
      // Default value removes the param from URL
      expect(new URLSearchParams(window.location.search).has("page")).toBe(false)
    })

    it("removes param from URL when value equals default", () => {
      const page = useUrlState("page", 1)
      page.set(5)
      expect(new URLSearchParams(window.location.search).get("page")).toBe("5")
      page.set(1) // back to default
      expect(new URLSearchParams(window.location.search).has("page")).toBe(false)
    })
  })

  // ── Schema mode ─────────────────────────────────────────────────────────

  describe("schema mode", () => {
    it("returns object of signals matching schema keys", () => {
      setSearch("?page=3&q=hello")
      const state = useUrlState({ page: 1, q: "" })

      expect(state.page()).toBe(3)
      expect(state.q()).toBe("hello")
    })

    it("defaults when params are missing", () => {
      const state = useUrlState({ page: 1, q: "" })
      expect(state.page()).toBe(1)
      expect(state.q()).toBe("")
    })

    it("set updates individual params", () => {
      const state = useUrlState({ page: 1, q: "" })
      state.q.set("search term")
      expect(state.q()).toBe("search term")
      expect(new URLSearchParams(window.location.search).get("q")).toBe("search term")
    })

    it("reset individual param", () => {
      setSearch("?page=5&q=hello")
      const state = useUrlState({ page: 1, q: "" })
      state.page.reset()
      expect(state.page()).toBe(1)
      // q should remain
      expect(new URLSearchParams(window.location.search).get("q")).toBe("hello")
    })
  })

  // ── Type coercion ─────────────────────────────────────────────────────

  describe("type coercion", () => {
    it("coerces number from URL string", () => {
      setSearch("?count=42")
      const count = useUrlState("count", 0)
      expect(count()).toBe(42)
      expect(typeof count()).toBe("number")
    })

    it("coerces boolean from URL string", () => {
      setSearch("?active=true")
      const active = useUrlState("active", false)
      expect(active()).toBe(true)
      expect(typeof active()).toBe("boolean")
    })

    it("coerces boolean false from URL string", () => {
      setSearch("?active=false")
      const active = useUrlState("active", true)
      expect(active()).toBe(false)
    })

    it("handles string identity", () => {
      setSearch("?name=alice")
      const name = useUrlState("name", "")
      expect(name()).toBe("alice")
    })

    it("handles string[] via comma-separated", () => {
      setSearch("?tags=a,b,c")
      const tags = useUrlState("tags", [] as string[])
      expect(tags()).toEqual(["a", "b", "c"])
    })

    it("handles empty string[] from URL", () => {
      setSearch("?tags=")
      const tags = useUrlState("tags", [] as string[])
      expect(tags()).toEqual([])
    })

    it("serializes string[] with commas", () => {
      const tags = useUrlState("tags", [] as string[])
      tags.set(["x", "y"])
      expect(new URLSearchParams(window.location.search).get("tags")).toBe("x,y")
    })

    it("handles object via JSON", () => {
      setSearch(`?filter=${encodeURIComponent(JSON.stringify({ min: 1, max: 10 }))}`)
      const filter = useUrlState("filter", { min: 0, max: 100 })
      expect(filter()).toEqual({ min: 1, max: 10 })
    })
  })

  // ── Custom serializer ──────────────────────────────────────────────────

  describe("custom serializer", () => {
    it("uses custom serialize/deserialize", () => {
      setSearch("?date=2024-01-15")
      const date = useUrlState("date", new Date(0), {
        serialize: (d) => d.toISOString().slice(0, 10),
        deserialize: (s) => new Date(s),
      })
      expect(date().getFullYear()).toBe(2024)

      date.set(new Date("2025-06-01"))
      expect(new URLSearchParams(window.location.search).get("date")).toBe("2025-06-01")
    })
  })

  // ── replace vs push ────────────────────────────────────────────────────

  describe("history mode", () => {
    it("uses replaceState by default", () => {
      const spy = vi.spyOn(history, "replaceState")
      const page = useUrlState("page", 1)
      page.set(2)
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it("uses pushState when replace: false", () => {
      const spy = vi.spyOn(history, "pushState")
      const page = useUrlState("page", 1, { replace: false })
      page.set(2)
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  // ── Popstate sync ─────────────────────────────────────────────────────

  describe("popstate sync", () => {
    it("updates signal on popstate event", () => {
      const page = useUrlState("page", 1)
      page.set(5)
      expect(page()).toBe(5)

      // Simulate browser back: change URL then fire popstate
      setSearch("?page=3")
      window.dispatchEvent(new Event("popstate"))
      expect(page()).toBe(3)
    })

    it("resets to default on popstate when param removed", () => {
      setSearch("?page=5")
      const page = useUrlState("page", 1)
      expect(page()).toBe(5)

      setSearch("")
      window.dispatchEvent(new Event("popstate"))
      expect(page()).toBe(1)
    })
  })

  // ── Debounce ──────────────────────────────────────────────────────────

  describe("debounce", () => {
    it("batches rapid writes", async () => {
      vi.useFakeTimers()
      const page = useUrlState("page", 1, { debounce: 50 })

      page.set(2)
      page.set(3)
      page.set(4)

      // Signal updates immediately
      expect(page()).toBe(4)
      // URL not yet updated (debounced)
      expect(new URLSearchParams(window.location.search).has("page")).toBe(false)

      vi.advanceTimersByTime(50)

      // Now URL is updated with final value
      expect(new URLSearchParams(window.location.search).get("page")).toBe("4")

      vi.useRealTimers()
    })
  })

  // ── Reactivity ────────────────────────────────────────────────────────

  describe("reactivity", () => {
    it("signal is reactive in effects", () => {
      const page = useUrlState("page", 1)
      const values: number[] = []

      const fx = effect(() => {
        values.push(page())
      })

      page.set(2)
      page.set(3)

      expect(values).toEqual([1, 2, 3])
      fx.dispose()
    })
  })
})
