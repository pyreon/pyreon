/**
 * @vitest-environment happy-dom
 */

import type { ComponentFn } from "@pyreon/core"
import { h } from "@pyreon/core"
import { hydrateIslands, startClient } from "../client"

// ─── startClient ────────────────────────────────────────────────────────────

describe("startClient", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    // biome-ignore lint/performance/noDelete: cleaning up test globals
    delete (window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__
  })

  test("throws when container is not found", () => {
    const App: ComponentFn = () => h("div", null, "app")
    expect(() => startClient({ App, routes: [] })).toThrow('Container "#app" not found')
  })

  test("throws with custom container selector not found", () => {
    const App: ComponentFn = () => h("div", null, "app")
    expect(() => startClient({ App, routes: [], container: "#missing" })).toThrow(
      'Container "#missing" not found',
    )
  })

  test("mounts app into empty container", () => {
    document.body.innerHTML = '<div id="app"></div>'
    const App: ComponentFn = () => h("div", null, "Hello")
    const cleanup = startClient({ App, routes: [{ path: "/", component: App }] })
    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  test("hydrates app when container has SSR content", () => {
    document.body.innerHTML = '<div id="app"><div>SSR Content</div></div>'
    const App: ComponentFn = () => h("div", null, "SSR Content")
    const cleanup = startClient({ App, routes: [{ path: "/", component: App }] })
    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  test("hydrates loader data from window global", () => {
    document.body.innerHTML = '<div id="app"></div>'
    ;(window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__ = {
      "/": { items: [1, 2] },
    }
    const App: ComponentFn = () => h("div", null, "app")
    const cleanup = startClient({ App, routes: [{ path: "/", component: App }] })
    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  test("ignores non-object loader data", () => {
    document.body.innerHTML = '<div id="app"></div>'
    ;(window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__ = "invalid"
    const App: ComponentFn = () => h("div", null, "app")
    const cleanup = startClient({ App, routes: [{ path: "/", component: App }] })
    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  test("accepts Element directly as container", () => {
    document.body.innerHTML = '<div id="custom"></div>'
    const el = document.getElementById("custom")!
    const App: ComponentFn = () => h("div", null, "app")
    const cleanup = startClient({ App, routes: [{ path: "/", component: App }], container: el })
    expect(typeof cleanup).toBe("function")
    cleanup()
  })
})

// ─── hydrateIslands ─────────────────────────────────────────────────────────

describe("hydrateIslands", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  test("returns cleanup function with no islands on page", () => {
    const cleanup = hydrateIslands({})
    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  test("skips islands without data-component attribute", () => {
    document.body.innerHTML = "<pyreon-island></pyreon-island>"
    const cleanup = hydrateIslands({})
    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  test("warns and skips islands with no matching loader", () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Missing" data-props="{}"></pyreon-island>'
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const cleanup = hydrateIslands({})
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No loader registered for island "Missing"'),
    )
    warnSpy.mockRestore()
    cleanup()
  })

  test("hydrates island with 'load' strategy (default)", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Counter" data-props=\'{"count":5}\'></pyreon-island>'

    const Counter: ComponentFn = (props) =>
      h("button", null, `Count: ${(props as Record<string, unknown>).count}`)

    const cleanup = hydrateIslands({
      Counter: () => Promise.resolve({ default: Counter }),
    })
    // Give async hydration time to resolve
    await new Promise((r) => setTimeout(r, 50))
    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  test("hydrates island with direct function module", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Widget" data-props="{}"></pyreon-island>'

    const Widget: ComponentFn = () => h("div", null, "widget")

    const cleanup = hydrateIslands({
      Widget: () => Promise.resolve(Widget) as Promise<{ default: ComponentFn }>,
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test("handles 'idle' hydration strategy", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Lazy" data-hydrate="idle" data-props="{}"></pyreon-island>'

    const Lazy: ComponentFn = () => h("div", null, "lazy")

    const cleanup = hydrateIslands({
      Lazy: () => Promise.resolve({ default: Lazy }),
    })
    // Wait for idle callback or timeout fallback
    await new Promise((r) => setTimeout(r, 300))
    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  test("handles 'never' hydration strategy — does not hydrate", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Static" data-hydrate="never" data-props="{}"></pyreon-island>'

    let called = false
    const Static: ComponentFn = () => {
      called = true
      return h("div", null, "static")
    }

    const cleanup = hydrateIslands({
      Static: () => Promise.resolve({ default: Static }),
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(called).toBe(false)
    cleanup()
  })

  test("handles 'visible' hydration strategy", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Visible" data-hydrate="visible" data-props="{}"></pyreon-island>'

    const Visible: ComponentFn = () => h("div", null, "visible")

    const cleanup = hydrateIslands({
      Visible: () => Promise.resolve({ default: Visible }),
    })
    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  test("handles 'media(...)' hydration strategy — immediate match", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Responsive" data-hydrate="media(all)" data-props="{}"></pyreon-island>'

    const Responsive: ComponentFn = () => h("div", null, "responsive")

    const cleanup = hydrateIslands({
      Responsive: () => Promise.resolve({ default: Responsive }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test("handles 'media(...)' hydration strategy — deferred match", async () => {
    // Use double parens so slice(6, -1) produces "(min-width: 99999px)" —
    // a valid media query that happy-dom correctly evaluates as non-matching.
    document.body.innerHTML =
      '<pyreon-island data-component="Responsive" data-hydrate="media((min-width: 99999px))" data-props="{}"></pyreon-island>'

    let hydrated = false
    const Responsive: ComponentFn = () => {
      hydrated = true
      return h("div", null, "responsive")
    }

    const cleanup = hydrateIslands({
      Responsive: () => Promise.resolve({ default: Responsive }),
    })
    await new Promise((r) => setTimeout(r, 50))
    // Media query doesn't match, so should not hydrate yet
    expect(hydrated).toBe(false)
    cleanup()
  })

  test("handles invalid island props JSON gracefully", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Bad" data-props="not valid json"></pyreon-island>'

    const Bad: ComponentFn = () => h("div", null, "bad")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Bad: () => Promise.resolve({ default: Bad }),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid island props JSON"),
      expect.anything(),
    )
    errorSpy.mockRestore()
    cleanup()
  })

  test("handles island props that parse to non-object", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Arr" data-props="[1,2,3]"></pyreon-island>'

    const Arr: ComponentFn = () => h("div", null)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Arr: () => Promise.resolve({ default: Arr }),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid island props JSON"),
      expect.anything(),
    )
    errorSpy.mockRestore()
    cleanup()
  })

  test("handles island props that parse to null", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Null" data-props="null"></pyreon-island>'

    const Null: ComponentFn = () => h("div", null)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Null: () => Promise.resolve({ default: Null }),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid island props JSON"),
      expect.anything(),
    )
    errorSpy.mockRestore()
    cleanup()
  })

  test("handles loader failure gracefully", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Fail" data-props="{}"></pyreon-island>'

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Fail: () => Promise.reject(new Error("import failed")),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to hydrate island "Fail"'),
      expect.anything(),
    )
    errorSpy.mockRestore()
    cleanup()
  })

  test("uses default empty props when data-props is missing", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="NoProps"></pyreon-island>'

    const NoProps: ComponentFn = () => h("div", null, "no-props")

    const cleanup = hydrateIslands({
      NoProps: () => Promise.resolve({ default: NoProps }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test("defaults hydration strategy to 'load' when data-hydrate is missing", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Default" data-props="{}"></pyreon-island>'

    const Default: ComponentFn = () => h("div", null, "default")

    const cleanup = hydrateIslands({
      Default: () => Promise.resolve({ default: Default }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test("cleanup cancels idle callbacks", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="IdleCancel" data-hydrate="idle" data-props="{}"></pyreon-island>'

    let hydrated = false
    const IdleCancel: ComponentFn = () => {
      hydrated = true
      return h("div", null)
    }

    const cleanup = hydrateIslands({
      IdleCancel: () => Promise.resolve({ default: IdleCancel }),
    })
    // Cancel immediately before idle fires
    cleanup()
    await new Promise((r) => setTimeout(r, 300))
    expect(hydrated).toBe(false)
  })

  test("handles unknown strategy as fallback (immediate hydration)", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Unknown" data-hydrate="custom-unknown" data-props="{}"></pyreon-island>'

    const Unknown: ComponentFn = () => h("div", null, "unknown")

    const cleanup = hydrateIslands({
      Unknown: () => Promise.resolve({ default: Unknown }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test("multiple islands hydrate independently", async () => {
    document.body.innerHTML = `
      <pyreon-island data-component="A" data-props='{"id":1}'></pyreon-island>
      <pyreon-island data-component="B" data-props='{"id":2}'></pyreon-island>
    `

    const A: ComponentFn = () => h("div", null, "a")
    const B: ComponentFn = () => h("div", null, "b")

    const cleanup = hydrateIslands({
      A: () => Promise.resolve({ default: A }),
      B: () => Promise.resolve({ default: B }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test("observeVisibility falls back to immediate callback when IntersectionObserver is missing", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Fallback" data-hydrate="visible" data-props="{}"></pyreon-island>'

    let hydrated = false
    const Fallback: ComponentFn = () => {
      hydrated = true
      return h("div", null, "fallback")
    }

    // Remove IntersectionObserver to trigger fallback
    const origIO = (window as Record<string, unknown>).IntersectionObserver
    // biome-ignore lint/performance/noDelete: test cleanup
    delete (window as Record<string, unknown>).IntersectionObserver

    const cleanup = hydrateIslands({
      Fallback: () => Promise.resolve({ default: Fallback }),
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(hydrated).toBe(true)
    cleanup()

    ;(window as Record<string, unknown>).IntersectionObserver = origIO
  })

  test("visible strategy: IntersectionObserver fires when element becomes visible", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="VisObs" data-hydrate="visible" data-props="{}"></pyreon-island>'

    let hydrated = false
    const VisObs: ComponentFn = () => {
      hydrated = true
      return h("div", null, "vis")
    }

    // Mock IntersectionObserver to call callback with isIntersecting: true
    const origIO = globalThis.IntersectionObserver
    let observerCb: IntersectionObserverCallback | null = null
    globalThis.IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) {
        observerCb = cb
      }
      observe(_el: Element) {
        // Trigger intersection immediately
        if (observerCb) {
          observerCb(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          )
        }
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
      get root() {
        return null
      }
      get rootMargin() {
        return ""
      }
      get thresholds() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    const cleanup = hydrateIslands({
      VisObs: () => Promise.resolve({ default: VisObs }),
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(hydrated).toBe(true)
    cleanup()

    globalThis.IntersectionObserver = origIO
  })

  test("visible strategy: IntersectionObserver entry not intersecting does not hydrate", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="VisNoInt" data-hydrate="visible" data-props="{}"></pyreon-island>'

    let hydrated = false
    const VisNoInt: ComponentFn = () => {
      hydrated = true
      return h("div", null, "vis")
    }

    const origIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(_el: Element) {
        // Trigger with isIntersecting: false
        this.cb(
          [{ isIntersecting: false } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        )
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
      get root() {
        return null
      }
      get rootMargin() {
        return ""
      }
      get thresholds() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    const cleanup = hydrateIslands({
      VisNoInt: () => Promise.resolve({ default: VisNoInt }),
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(hydrated).toBe(false)
    cleanup()

    globalThis.IntersectionObserver = origIO
  })

  test("media strategy: deferred match fires onChange handler", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="MediaDeferred" data-hydrate="media((min-width: 99999px))" data-props="{}"></pyreon-island>'

    let hydrated = false
    const MediaDeferred: ComponentFn = () => {
      hydrated = true
      return h("div", null, "media")
    }

    // Mock matchMedia to initially not match, then trigger change
    const origMatchMedia = window.matchMedia
    let storedOnChange: ((e: MediaQueryListEvent) => void) | null = null
    window.matchMedia = (_query: string) => {
      const mql = {
        matches: false,
        media: _query,
        onchange: null,
        addEventListener: (_type: string, listener: (e: MediaQueryListEvent) => void) => {
          storedOnChange = listener
        },
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      } as unknown as MediaQueryList
      return mql
    }

    const cleanup = hydrateIslands({
      MediaDeferred: () => Promise.resolve({ default: MediaDeferred }),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(hydrated).toBe(false)

    // Now simulate the media query matching
    if (storedOnChange) {
      storedOnChange({ matches: true } as MediaQueryListEvent)
    }
    await new Promise((r) => setTimeout(r, 100))
    expect(hydrated).toBe(true)

    cleanup()
    window.matchMedia = origMatchMedia
  })

  test("media strategy: onChange handler ignores non-matching events", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="MediaNoMatch" data-hydrate="media((min-width: 99999px))" data-props="{}"></pyreon-island>'

    let hydrated = false
    const MediaNoMatch: ComponentFn = () => {
      hydrated = true
      return h("div", null, "media")
    }

    const origMatchMedia = window.matchMedia
    let storedOnChange: ((e: MediaQueryListEvent) => void) | null = null
    window.matchMedia = (_query: string) => {
      return {
        matches: false,
        media: _query,
        onchange: null,
        addEventListener: (_type: string, listener: (e: MediaQueryListEvent) => void) => {
          storedOnChange = listener
        },
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      } as unknown as MediaQueryList
    }

    const cleanup = hydrateIslands({
      MediaNoMatch: () => Promise.resolve({ default: MediaNoMatch }),
    })
    await new Promise((r) => setTimeout(r, 50))

    // Trigger with matches: false — should not hydrate
    if (storedOnChange) {
      storedOnChange({ matches: false } as MediaQueryListEvent)
    }
    await new Promise((r) => setTimeout(r, 100))
    expect(hydrated).toBe(false)

    cleanup()
    window.matchMedia = origMatchMedia
  })
})
