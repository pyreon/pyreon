import { effect } from "@pyreon/reactivity"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setUrlRouter, useUrlState } from "../index"

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
    setUrlRouter(null)
  })

  afterEach(() => {
    setSearch("")
    setUrlRouter(null)
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

  // ── remove() ──────────────────────────────────────────────────────────

  describe("remove()", () => {
    it("removes param from URL and resets signal to default", () => {
      const page = useUrlState("page", 1)
      page.set(5)
      expect(page()).toBe(5)
      expect(new URLSearchParams(window.location.search).get("page")).toBe("5")

      page.remove()
      expect(page()).toBe(1)
      expect(new URLSearchParams(window.location.search).has("page")).toBe(false)
    })

    it("removes param even when value equals default", () => {
      // Set URL with a non-default value, then reset, then set again to default
      setSearch("?page=1")
      const page = useUrlState("page", 1)
      // Value is 1 (default), but param is in URL
      // remove() should guarantee it's gone
      page.remove()
      expect(page()).toBe(1)
      expect(new URLSearchParams(window.location.search).has("page")).toBe(false)
    })

    it("cancels pending debounced write", () => {
      vi.useFakeTimers()
      const page = useUrlState("page", 1, { debounce: 100 })

      page.set(5) // starts debounce timer
      page.remove() // should cancel the debounce and remove immediately

      // Signal is default
      expect(page()).toBe(1)
      // URL should not have the param (remove is immediate, not debounced)
      expect(new URLSearchParams(window.location.search).has("page")).toBe(false)

      vi.advanceTimersByTime(100)
      // Still removed — the debounced write should not have fired
      expect(new URLSearchParams(window.location.search).has("page")).toBe(false)

      vi.useRealTimers()
    })

    it("works with array values (comma format)", () => {
      const tags = useUrlState("tags", [] as string[])
      tags.set(["a", "b"])
      expect(new URLSearchParams(window.location.search).get("tags")).toBe("a,b")

      tags.remove()
      expect(tags()).toEqual([])
      expect(new URLSearchParams(window.location.search).has("tags")).toBe(false)
    })

    it("works with array values (repeat format)", () => {
      const tags = useUrlState("tags", [] as string[], { arrayFormat: "repeat" })
      tags.set(["x", "y"])
      expect(new URLSearchParams(window.location.search).getAll("tags")).toEqual(["x", "y"])

      tags.remove()
      expect(tags()).toEqual([])
      expect(new URLSearchParams(window.location.search).has("tags")).toBe(false)
    })

    it("preserves other params when removing", () => {
      setSearch("?page=3&q=hello")
      const page = useUrlState("page", 1)
      page.remove()
      expect(new URLSearchParams(window.location.search).has("page")).toBe(false)
      expect(new URLSearchParams(window.location.search).get("q")).toBe("hello")
    })
  })

  // ── Array format ──────────────────────────────────────────────────────

  describe("arrayFormat", () => {
    describe("comma (default)", () => {
      it("reads comma-separated values from URL", () => {
        setSearch("?tags=a,b,c")
        const tags = useUrlState("tags", [] as string[])
        expect(tags()).toEqual(["a", "b", "c"])
      })

      it("writes comma-separated values to URL", () => {
        const tags = useUrlState("tags", [] as string[])
        tags.set(["x", "y", "z"])
        expect(new URLSearchParams(window.location.search).get("tags")).toBe("x,y,z")
      })

      it("explicit comma format matches default behavior", () => {
        setSearch("?tags=a,b")
        const tags = useUrlState("tags", [] as string[], { arrayFormat: "comma" })
        expect(tags()).toEqual(["a", "b"])
      })
    })

    describe("repeat", () => {
      it("reads repeated keys from URL", () => {
        setSearch("?tags=a&tags=b&tags=c")
        const tags = useUrlState("tags", [] as string[], { arrayFormat: "repeat" })
        expect(tags()).toEqual(["a", "b", "c"])
      })

      it("writes repeated keys to URL", () => {
        const tags = useUrlState("tags", [] as string[], { arrayFormat: "repeat" })
        tags.set(["x", "y"])
        const params = new URLSearchParams(window.location.search)
        expect(params.getAll("tags")).toEqual(["x", "y"])
      })

      it("falls back to default when no repeated keys in URL", () => {
        const tags = useUrlState("tags", ["default"] as string[], { arrayFormat: "repeat" })
        expect(tags()).toEqual(["default"])
      })

      it("removes repeated keys when value equals default (empty array)", () => {
        const tags = useUrlState("tags", [] as string[], { arrayFormat: "repeat" })
        tags.set(["a", "b"])
        expect(new URLSearchParams(window.location.search).getAll("tags")).toEqual(["a", "b"])

        tags.set([]) // back to default
        expect(new URLSearchParams(window.location.search).has("tags")).toBe(false)
      })

      it("popstate syncs repeated keys", () => {
        const tags = useUrlState("tags", [] as string[], { arrayFormat: "repeat" })
        tags.set(["a", "b"])
        expect(tags()).toEqual(["a", "b"])

        setSearch("?tags=x&tags=y&tags=z")
        window.dispatchEvent(new Event("popstate"))
        expect(tags()).toEqual(["x", "y", "z"])
      })

      it("popstate resets to default when repeated keys removed", () => {
        setSearch("?tags=a&tags=b")
        const tags = useUrlState("tags", [] as string[], { arrayFormat: "repeat" })
        expect(tags()).toEqual(["a", "b"])

        setSearch("")
        window.dispatchEvent(new Event("popstate"))
        expect(tags()).toEqual([])
      })
    })
  })

  // ── onChange callback ────────────────────────────────────────────────

  describe("onChange", () => {
    it("does not fire on .set() (only external changes)", () => {
      const changes: number[] = []
      const page = useUrlState("page", 1, {
        onChange: (v) => changes.push(v),
      })

      page.set(2)
      page.set(3)
      // .set() is an explicit call — onChange only fires on external changes
      expect(changes).toEqual([])
    })

    it("fires on popstate (external change)", () => {
      const changes: number[] = []
      useUrlState("page", 1, {
        onChange: (v) => changes.push(v),
      })

      setSearch("?page=7")
      window.dispatchEvent(new Event("popstate"))
      expect(changes).toEqual([7])
    })

    it("fires with default value on popstate when param removed", () => {
      setSearch("?page=5")
      const changes: number[] = []
      useUrlState("page", 1, {
        onChange: (v) => changes.push(v),
      })

      setSearch("")
      window.dispatchEvent(new Event("popstate"))
      expect(changes).toEqual([1])
    })

    it("does not fire on .reset()", () => {
      const changes: number[] = []
      const page = useUrlState("page", 1, {
        onChange: (v) => changes.push(v),
      })
      page.set(5)

      page.reset()
      expect(changes).toEqual([])
    })

    it("does not fire on .remove()", () => {
      const changes: number[] = []
      const page = useUrlState("page", 1, {
        onChange: (v) => changes.push(v),
      })
      page.set(5)

      page.remove()
      expect(changes).toEqual([])
    })

    it("works with array values and popstate", () => {
      const changes: string[][] = []
      useUrlState("tags", [] as string[], {
        arrayFormat: "repeat",
        onChange: (v) => changes.push(v as string[]),
      })

      setSearch("?tags=a&tags=b")
      window.dispatchEvent(new Event("popstate"))
      expect(changes).toEqual([["a", "b"]])
    })
  })

  // ── Router integration ────────────────────────────────────────────────

  describe("router integration", () => {
    it("uses router.replace() when router is set", () => {
      const replaceCalls: string[] = []
      setUrlRouter({
        replace: (path: string) => {
          replaceCalls.push(path)
          // Simulate what a real router does — update the URL
          history.replaceState(null, "", path)
        },
      })

      const page = useUrlState("page", 1)
      page.set(3)

      expect(replaceCalls.length).toBe(1)
      expect(replaceCalls[0]).toContain("page=3")
    })

    it("does not call history.replaceState directly when router is set", () => {
      const spy = vi.spyOn(history, "replaceState")

      setUrlRouter({
        replace: (_path: string) => {
          // No-op — intentionally doesn't call history API
        },
      })

      const page = useUrlState("page", 1)
      page.set(3)

      // replaceState should NOT have been called by setParams (only by setSearch in beforeEach)
      // We need to account for the beforeEach call
      const callCountBefore = spy.mock.calls.length
      page.set(4)
      expect(spy.mock.calls.length).toBe(callCountBefore) // no new calls

      spy.mockRestore()
    })

    it("falls back to history API when no router is set", () => {
      const spy = vi.spyOn(history, "replaceState")
      setUrlRouter(null)

      const page = useUrlState("page", 1)
      page.set(2)

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it("router.replace() receives correct URL for repeat arrays", () => {
      const replaceCalls: string[] = []
      setUrlRouter({
        replace: (path: string) => {
          replaceCalls.push(path)
          history.replaceState(null, "", path)
        },
      })

      const tags = useUrlState("tags", [] as string[], { arrayFormat: "repeat" })
      tags.set(["a", "b"])

      expect(replaceCalls.length).toBe(1)
      expect(replaceCalls[0]).toContain("tags=a&tags=b")
    })

    it("router.replace() used for remove()", () => {
      const replaceCalls: string[] = []
      setUrlRouter({
        replace: (path: string) => {
          replaceCalls.push(path)
          history.replaceState(null, "", path)
        },
      })

      const page = useUrlState("page", 1)
      page.set(5)
      replaceCalls.length = 0

      page.remove()
      expect(replaceCalls.length).toBe(1)
      // The param should not be in the URL
      expect(replaceCalls[0]).not.toContain("page=")
    })
  })
})
