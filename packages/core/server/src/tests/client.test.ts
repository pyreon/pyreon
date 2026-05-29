/**
 * @vitest-environment happy-dom
 */

import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { hydrateIslands, hydrateIslandsAuto, startClient } from '../client'

// ─── startClient ────────────────────────────────────────────────────────────

describe('startClient', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    delete (window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__
  })

  test('throws when container is not found', () => {
    const App: ComponentFn = () => h('div', null, 'app')
    expect(() => startClient({ App, routes: [] })).toThrow('Container "#app" not found')
  })

  test('throws with custom container selector not found', () => {
    const App: ComponentFn = () => h('div', null, 'app')
    expect(() => startClient({ App, routes: [], container: '#missing' })).toThrow(
      'Container "#missing" not found',
    )
  })

  test('mounts app into empty container', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const App: ComponentFn = () => h('div', null, 'Hello')
    const cleanup = startClient({ App, routes: [{ path: '/', component: App }] })
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  test('hydrates app when container has SSR content', () => {
    document.body.innerHTML = '<div id="app"><div>SSR Content</div></div>'
    const App: ComponentFn = () => h('div', null, 'SSR Content')
    const cleanup = startClient({ App, routes: [{ path: '/', component: App }] })
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  test('hydrates loader data from window global', () => {
    document.body.innerHTML = '<div id="app"></div>'
    ;(window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__ = {
      '/': { items: [1, 2] },
    }
    const App: ComponentFn = () => h('div', null, 'app')
    const cleanup = startClient({ App, routes: [{ path: '/', component: App }] })
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  test('ignores non-object loader data', () => {
    document.body.innerHTML = '<div id="app"></div>'
    ;(window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__ = 'invalid'
    const App: ComponentFn = () => h('div', null, 'app')
    const cleanup = startClient({ App, routes: [{ path: '/', component: App }] })
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  test('accepts Element directly as container', () => {
    document.body.innerHTML = '<div id="custom"></div>'
    const el = document.getElementById('custom')!
    const App: ComponentFn = () => h('div', null, 'app')
    const cleanup = startClient({ App, routes: [{ path: '/', component: App }], container: el })
    expect(typeof cleanup).toBe('function')
    cleanup()
  })
})

// ─── hydrateIslands ─────────────────────────────────────────────────────────

describe('hydrateIslands', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // Reset the dev-mode HMR re-register guard so each spec starts clean.
    delete (window as unknown as Record<string, unknown>).__pyreon_island_hydrate_active__
  })

  test('dev warns when called twice without invoking the previous cleanup (HMR footgun)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // First call — no warning, registers the guard flag on window.
    const cleanup1 = hydrateIslands({})
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('hydrateIslands() called again'),
    )

    // Second call WITHOUT calling cleanup1 — leaks listeners. Warn loudly.
    const cleanup2 = hydrateIslands({})
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('hydrateIslands() called again without invoking the previous'),
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('import.meta.hot.dispose(cleanup)'),
    )

    // The second call still proceeds — HMR / route-change DOES require
    // re-registration. The warning is informational, not blocking.
    expect(typeof cleanup2).toBe('function')

    // After invoking cleanup, the guard clears — subsequent re-register
    // is silent again.
    cleanup1()
    cleanup2()
    warnSpy.mockClear()
    const cleanup3 = hydrateIslands({})
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('hydrateIslands() called again'),
    )
    cleanup3()

    warnSpy.mockRestore()
  })

  test('returns cleanup function with no islands on page', () => {
    const cleanup = hydrateIslands({})
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  test('skips islands without data-component attribute', () => {
    document.body.innerHTML = '<pyreon-island></pyreon-island>'
    const cleanup = hydrateIslands({})
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  test('warns and skips islands with no matching loader', () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Missing" data-props="{}"></pyreon-island>'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
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
      h('button', null, `Count: ${(props as Record<string, unknown>).count}`)

    const cleanup = hydrateIslands({
      Counter: () => Promise.resolve({ default: Counter }),
    })
    // Give async hydration time to resolve
    await new Promise((r) => setTimeout(r, 50))
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  test('hydrates island with direct function module', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Widget" data-props="{}"></pyreon-island>'

    const Widget: ComponentFn = () => h('div', null, 'widget')

    const cleanup = hydrateIslands({
      Widget: () => Promise.resolve({ default: Widget }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test("handles 'idle' hydration strategy", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Lazy" data-hydrate="idle" data-props="{}"></pyreon-island>'

    const Lazy: ComponentFn = () => h('div', null, 'lazy')

    const cleanup = hydrateIslands({
      Lazy: () => Promise.resolve({ default: Lazy }),
    })
    // Wait for idle callback or timeout fallback
    await new Promise((r) => setTimeout(r, 300))
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  test("handles 'never' hydration strategy — does not hydrate", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Static" data-hydrate="never" data-props="{}"></pyreon-island>'

    let called = false
    const Static: ComponentFn = () => {
      called = true
      return h('div', null, 'static')
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

    const Visible: ComponentFn = () => h('div', null, 'visible')

    const cleanup = hydrateIslands({
      Visible: () => Promise.resolve({ default: Visible }),
    })
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  test("handles 'media(...)' hydration strategy — immediate match", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Responsive" data-hydrate="media(all)" data-props="{}"></pyreon-island>'

    const Responsive: ComponentFn = () => h('div', null, 'responsive')

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
      return h('div', null, 'responsive')
    }

    const cleanup = hydrateIslands({
      Responsive: () => Promise.resolve({ default: Responsive }),
    })
    await new Promise((r) => setTimeout(r, 50))
    // Media query doesn't match, so should not hydrate yet
    expect(hydrated).toBe(false)
    cleanup()
  })

  test('handles invalid island props JSON gracefully', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Bad" data-props="not valid json"></pyreon-island>'

    const Bad: ComponentFn = () => h('div', null, 'bad')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Bad: () => Promise.resolve({ default: Bad }),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid island props JSON'),
      expect.anything(),
    )
    errorSpy.mockRestore()
    cleanup()
  })

  test('handles island props that parse to non-object', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Arr" data-props="[1,2,3]"></pyreon-island>'

    const Arr: ComponentFn = () => h('div', null)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Arr: () => Promise.resolve({ default: Arr }),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid island props JSON'),
      expect.anything(),
    )
    errorSpy.mockRestore()
    cleanup()
  })

  test('handles island props that parse to null', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Null" data-props="null"></pyreon-island>'

    const Null: ComponentFn = () => h('div', null)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Null: () => Promise.resolve({ default: Null }),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid island props JSON'),
      expect.anything(),
    )
    errorSpy.mockRestore()
    cleanup()
  })

  test('handles loader failure gracefully', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Fail" data-props="{}"></pyreon-island>'

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Fail: () => Promise.reject(new Error('import failed')),
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to hydrate island "Fail"'),
      expect.anything(),
    )
    errorSpy.mockRestore()
    cleanup()
  })

  test('uses default empty props when data-props is missing', async () => {
    document.body.innerHTML = '<pyreon-island data-component="NoProps"></pyreon-island>'

    const NoProps: ComponentFn = () => h('div', null, 'no-props')

    const cleanup = hydrateIslands({
      NoProps: () => Promise.resolve({ default: NoProps }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test("defaults hydration strategy to 'load' when data-hydrate is missing", async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Default" data-props="{}"></pyreon-island>'

    const Default: ComponentFn = () => h('div', null, 'default')

    const cleanup = hydrateIslands({
      Default: () => Promise.resolve({ default: Default }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test('cleanup cancels idle callbacks', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="IdleCancel" data-hydrate="idle" data-props="{}"></pyreon-island>'

    let hydrated = false
    const IdleCancel: ComponentFn = () => {
      hydrated = true
      return h('div', null)
    }

    const cleanup = hydrateIslands({
      IdleCancel: () => Promise.resolve({ default: IdleCancel }),
    })
    // Cancel immediately before idle fires
    cleanup()
    await new Promise((r) => setTimeout(r, 300))
    expect(hydrated).toBe(false)
  })

  test('handles unknown strategy as fallback (immediate hydration)', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Unknown" data-hydrate="custom-unknown" data-props="{}"></pyreon-island>'

    const Unknown: ComponentFn = () => h('div', null, 'unknown')

    const cleanup = hydrateIslands({
      Unknown: () => Promise.resolve({ default: Unknown }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test('multiple islands hydrate independently', async () => {
    document.body.innerHTML = `
      <pyreon-island data-component="A" data-props='{"id":1}'></pyreon-island>
      <pyreon-island data-component="B" data-props='{"id":2}'></pyreon-island>
    `

    const A: ComponentFn = () => h('div', null, 'a')
    const B: ComponentFn = () => h('div', null, 'b')

    const cleanup = hydrateIslands({
      A: () => Promise.resolve({ default: A }),
      B: () => Promise.resolve({ default: B }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })

  test('observeVisibility falls back to immediate callback when IntersectionObserver is missing', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Fallback" data-hydrate="visible" data-props="{}"></pyreon-island>'

    let hydrated = false
    const Fallback: ComponentFn = () => {
      hydrated = true
      return h('div', null, 'fallback')
    }

    // Remove IntersectionObserver to trigger fallback
    const origIO = (window as unknown as Record<string, unknown>).IntersectionObserver
    delete (window as unknown as Record<string, unknown>).IntersectionObserver

    const cleanup = hydrateIslands({
      Fallback: () => Promise.resolve({ default: Fallback }),
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(hydrated).toBe(true)
    cleanup()

    ;(window as unknown as Record<string, unknown>).IntersectionObserver = origIO
  })

  test('visible strategy: IntersectionObserver fires when element becomes visible', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="VisObs" data-hydrate="visible" data-props="{}"></pyreon-island>'

    let hydrated = false
    const VisObs: ComponentFn = () => {
      hydrated = true
      return h('div', null, 'vis')
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
        return ''
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

  test('visible strategy: IntersectionObserver entry not intersecting does not hydrate', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="VisNoInt" data-hydrate="visible" data-props="{}"></pyreon-island>'

    let hydrated = false
    const VisNoInt: ComponentFn = () => {
      hydrated = true
      return h('div', null, 'vis')
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
        return ''
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

  test('media strategy: deferred match fires onChange handler', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="MediaDeferred" data-hydrate="media((min-width: 99999px))" data-props="{}"></pyreon-island>'

    let hydrated = false
    const MediaDeferred: ComponentFn = () => {
      hydrated = true
      return h('div', null, 'media')
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
    const onChange1 = storedOnChange as ((e: MediaQueryListEvent) => void) | null
    if (onChange1) {
      onChange1({ matches: true } as MediaQueryListEvent)
    }
    await new Promise((r) => setTimeout(r, 100))
    expect(hydrated).toBe(true)

    cleanup()
    window.matchMedia = origMatchMedia
  })

  test('media strategy: onChange handler ignores non-matching events', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="MediaNoMatch" data-hydrate="media((min-width: 99999px))" data-props="{}"></pyreon-island>'

    let hydrated = false
    const MediaNoMatch: ComponentFn = () => {
      hydrated = true
      return h('div', null, 'media')
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
    const onChange2 = storedOnChange as ((e: MediaQueryListEvent) => void) | null
    if (onChange2) {
      onChange2({ matches: false } as MediaQueryListEvent)
    }
    await new Promise((r) => setTimeout(r, 100))
    expect(hydrated).toBe(false)

    cleanup()
    window.matchMedia = origMatchMedia
  })

  test('marks nested islands with data-island-error="nested" and skips them', () => {
    document.body.innerHTML = `
      <pyreon-island data-component="Outer" data-props="{}">
        <div>
          <pyreon-island data-component="Inner" data-props="{}"></pyreon-island>
        </div>
      </pyreon-island>
    `
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const Outer: ComponentFn = () => h('div', null, 'outer')
    const Inner: ComponentFn = () => h('div', null, 'inner')

    const cleanup = hydrateIslands({
      Outer: () => Promise.resolve({ default: Outer }),
      Inner: () => Promise.resolve({ default: Inner }),
    })

    const inner = document.querySelector('pyreon-island[data-component="Inner"]')!
    expect(inner.getAttribute('data-island-error')).toBe('nested')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('nested inside another <pyreon-island>'),
    )
    // Outer is not nested → not marked
    const outer = document.querySelector('pyreon-island[data-component="Outer"]')!
    expect(outer.getAttribute('data-island-error')).toBeNull()

    errorSpy.mockRestore()
    cleanup()
  })

  test('marks islands with no registered loader as data-island-error="no-loader"', () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Missing" data-props="{}"></pyreon-island>'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cleanup = hydrateIslands({})
    const el = document.querySelector('pyreon-island')!
    expect(el.getAttribute('data-island-error')).toBe('no-loader')

    warnSpy.mockRestore()
    cleanup()
  })

  test('marks islands with invalid props JSON as data-island-error="invalid-props"', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Bad" data-props="not json"></pyreon-island>'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const Comp: ComponentFn = () => h('div', null)
    const cleanup = hydrateIslands({
      Bad: () => Promise.resolve({ default: Comp }),
    })
    await new Promise((r) => setTimeout(r, 50))

    const el = document.querySelector('pyreon-island')!
    expect(el.getAttribute('data-island-error')).toBe('invalid-props')

    errorSpy.mockRestore()
    cleanup()
  })

  test('prefetch=idle: pre-warms loader during idle BEFORE hydration trigger', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="PreIdle" data-hydrate="visible" data-prefetch="idle" data-props="{}"></pyreon-island>'

    let loaderCalls = 0
    const Comp: ComponentFn = () => h('div', null, 'pre-idle')

    // Mock IntersectionObserver so it does NOT auto-fire on observe — this
    // isolates the prefetch path from hydration.
    const origIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
      get root() {
        return null
      }
      get rootMargin() {
        return ''
      }
      get thresholds() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    const cleanup = hydrateIslands({
      PreIdle: () => {
        loaderCalls++
        return Promise.resolve({ default: Comp })
      },
    })
    // Wait long enough for requestIdleCallback (or its setTimeout fallback)
    // to fire — happy-dom doesn't ship requestIdleCallback so the 200ms
    // setTimeout fallback is what we exercise here.
    await new Promise((r) => setTimeout(r, 300))

    expect(loaderCalls).toBe(1)
    cleanup()
    globalThis.IntersectionObserver = origIO
  })

  test('prefetch=visible: pre-warms loader via IntersectionObserver before hydration', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="PreVis" data-hydrate="media((max-width: 1px))" data-prefetch="visible" data-props="{}"></pyreon-island>'

    let loaderCalls = 0
    const Comp: ComponentFn = () => h('div', null, 'pre-vis')

    // Two IntersectionObserver instances are created when both prefetch=visible
    // AND hydrate=visible — but here hydrate=media(unmatched), so only ONE
    // IntersectionObserver instance is created (the prefetch one). Fire its
    // callback synchronously on observe().
    const origIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class {
      private cb: IntersectionObserverCallback
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb
      }
      observe(_el: Element) {
        this.cb(
          [{ isIntersecting: true } as IntersectionObserverEntry],
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
        return ''
      }
      get thresholds() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    // Mock matchMedia → matches: false so hydration does NOT fire.
    const origMatchMedia = window.matchMedia
    window.matchMedia = (q: string) =>
      ({
        matches: false,
        media: q,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList

    const cleanup = hydrateIslands({
      PreVis: () => {
        loaderCalls++
        return Promise.resolve({ default: Comp })
      },
    })
    await new Promise((r) => setTimeout(r, 50))

    // Loader called exactly once via the prefetch IntersectionObserver path.
    // hydrate=media doesn't match → no second loader call from hydration.
    expect(loaderCalls).toBe(1)

    cleanup()
    globalThis.IntersectionObserver = origIO
    window.matchMedia = origMatchMedia
  })

  test('prefetch=visible falls back to immediate prime when IntersectionObserver is missing', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="PreFallback" data-hydrate="media((max-width: 1px))" data-prefetch="visible" data-props="{}"></pyreon-island>'

    let loaderCalls = 0
    const Comp: ComponentFn = () => h('div', null, 'fb')

    const origIO = (window as unknown as Record<string, unknown>).IntersectionObserver
    delete (window as unknown as Record<string, unknown>).IntersectionObserver
    const origMatchMedia = window.matchMedia
    window.matchMedia = (q: string) =>
      ({
        matches: false,
        media: q,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList

    const cleanup = hydrateIslands({
      PreFallback: () => {
        loaderCalls++
        return Promise.resolve({ default: Comp })
      },
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(loaderCalls).toBe(1)

    cleanup()
    ;(window as unknown as Record<string, unknown>).IntersectionObserver = origIO
    window.matchMedia = origMatchMedia
  })

  test('prefetch absent (default none): does NOT call loader before hydration trigger', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="NoPre" data-hydrate="visible" data-props="{}"></pyreon-island>'

    let loaderCalls = 0
    const Comp: ComponentFn = () => h('div', null)

    // Block IntersectionObserver from auto-firing → hydration won't run either.
    const origIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
      get root() {
        return null
      }
      get rootMargin() {
        return ''
      }
      get thresholds() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    const cleanup = hydrateIslands({
      NoPre: () => {
        loaderCalls++
        return Promise.resolve({ default: Comp })
      },
    })
    await new Promise((r) => setTimeout(r, 300))
    expect(loaderCalls).toBe(0)

    cleanup()
    globalThis.IntersectionObserver = origIO
  })

  test('prefetch loader rejection: caught silently when hydration NEVER fires (no unhandled rejection)', async () => {
    // Contract under test: prefetch is fire-and-forget. If the loader rejects
    // AND no subsequent hydration call ever runs (e.g. media-query strategy
    // that never matches, or user navigates away pre-scroll), the rejection
    // MUST NOT bubble up as `unhandledrejection`. Hydration's own `await
    // loader()` would otherwise consume the rejection via JS's import-promise
    // dedup — but in this scenario hydration never fires, so prefetch's own
    // `.catch(() => {})` is the ONLY handler, and removing it would surface
    // the unhandled rejection.
    //
    // To isolate prefetch from hydration: pair `prefetch: 'idle'` with a
    // media query that can never match (max-width: 1px), so the hydration
    // path stays parked forever and prefetch's catch handler is the only
    // protection.
    document.body.innerHTML =
      '<pyreon-island data-component="RejectPre" data-hydrate="media((max-width: 1px))" data-prefetch="idle" data-props="{}"></pyreon-island>'

    let prefetchCalls = 0
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Mock matchMedia → never matches, so hydration's mql.addEventListener
    // path waits forever and never calls loader().
    const origMatchMedia = window.matchMedia
    window.matchMedia = (q: string) =>
      ({
        matches: false,
        media: q,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList

    // Listen on BOTH `window.unhandledrejection` (browser env) and Node's
    // `process.on('unhandledRejection')` — vitest's happy-dom env doesn't
    // reliably fire the browser event, but Node-level rejection tracking
    // does fire (vitest's runner is Node + happy-dom shims).
    let unhandled = false
    const onUnhandled = (event: PromiseRejectionEvent) => {
      unhandled = true
      event.preventDefault?.()
    }
    const onProcUnhandled = (reason: unknown) => {
      // Only flag rejections that came from OUR loader (not test runner internals).
      if (reason instanceof Error && reason.message === 'boom') {
        unhandled = true
      }
    }
    window.addEventListener('unhandledrejection', onUnhandled)
    process.on('unhandledRejection', onProcUnhandled)

    const cleanup = hydrateIslands({
      RejectPre: () => {
        prefetchCalls++
        return Promise.reject(new Error('boom'))
      },
    })

    // Wait long enough for: idle-fallback setTimeout(200), microtask drain,
    // and Node's unhandledRejection tick (deferred to next tick by spec).
    await new Promise((r) => setTimeout(r, 400))
    // Force one more macrotask so Node's unhandledRejection has fired.
    await new Promise((r) => setImmediate(r))

    // Prefetch fired (proves the rejection actually reached the handler).
    expect(prefetchCalls).toBe(1)
    // Critical assertion: no unhandled rejection. This is what
    // `loader().catch(() => {})` protects.
    expect(unhandled).toBe(false)

    cleanup()
    window.matchMedia = origMatchMedia
    window.removeEventListener('unhandledrejection', onUnhandled)
    process.off('unhandledRejection', onProcUnhandled)
    errorSpy.mockRestore()
  })

  test('cleanup cancels pending prefetch before it fires', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="CancelPre" data-hydrate="visible" data-prefetch="idle" data-props="{}"></pyreon-island>'

    let loaderCalls = 0
    const Comp: ComponentFn = () => h('div', null)

    const origIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
      get root() {
        return null
      }
      get rootMargin() {
        return ''
      }
      get thresholds() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    const cleanup = hydrateIslands({
      CancelPre: () => {
        loaderCalls++
        return Promise.resolve({ default: Comp })
      },
    })
    // Cancel BEFORE the 200ms setTimeout fallback fires.
    cleanup()
    await new Promise((r) => setTimeout(r, 300))
    expect(loaderCalls).toBe(0)

    globalThis.IntersectionObserver = origIO
  })

  // ─── hydrateIslandsAuto tests ────────────────────────────────────────────

  test('hydrateIslandsAuto: throws on disabled stub registry with actionable message', () => {
    expect(() =>
      hydrateIslandsAuto({
        __pyreonIslandsEnabled: false,
        __pyreonIslandRegistry: {},
      }),
    ).toThrow(/pyreon\({ islands: true }\)/)
  })

  test('hydrateIslandsAuto: forwards enabled registry to hydrateIslands', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Auto" data-props="{}"></pyreon-island>'

    let loaded = 0
    const cleanup = hydrateIslandsAuto({
      __pyreonIslandsEnabled: true,
      __pyreonIslandRegistry: {
        Auto: () => {
          loaded++
          return Promise.resolve({ default: () => h('div', null, 'auto') })
        },
      },
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(loaded).toBe(1)

    cleanup()
  })

  // ─── requestIdleCallback path tests (happy-dom lacks it natively) ────────

  test('hydrate=idle: uses requestIdleCallback when present + cancelIdleCallback on cleanup', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Idle" data-hydrate="idle" data-props="{}"></pyreon-island>'

    let scheduled: ((deadline?: unknown) => void) | null = null
    let cancelledId: number | null = null
    ;(window as unknown as Record<string, unknown>).requestIdleCallback = (cb: () => void) => {
      scheduled = cb
      return 42
    }
    ;(window as unknown as Record<string, unknown>).cancelIdleCallback = (id: number) => {
      cancelledId = id
    }

    let loaded = 0
    const cleanup = hydrateIslands({
      Idle: () => {
        loaded++
        return Promise.resolve({ default: () => h('div', null, 'idle') })
      },
    })

    expect(typeof scheduled).toBe('function')
    cleanup()
    expect(cancelledId).toBe(42)
    // After cancellation, even if the idle callback fires, the cancel guard skips the load.
    if (scheduled) (scheduled as () => void)()
    await new Promise((r) => setTimeout(r, 20))
    expect(loaded).toBe(0)

    delete (window as unknown as Record<string, unknown>).requestIdleCallback
    delete (window as unknown as Record<string, unknown>).cancelIdleCallback
  })

  test('prefetch=idle: uses requestIdleCallback when present + cancelIdleCallback on cleanup', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="PreIdleNative" data-hydrate="visible" data-prefetch="idle" data-props="{}"></pyreon-island>'

    let scheduled: ((deadline?: unknown) => void) | null = null
    let cancelledId: number | null = null
    ;(window as unknown as Record<string, unknown>).requestIdleCallback = (cb: () => void) => {
      scheduled = cb
      return 99
    }
    ;(window as unknown as Record<string, unknown>).cancelIdleCallback = (id: number) => {
      cancelledId = id
    }

    // Block IntersectionObserver from auto-firing.
    const origIO = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
      get root() {
        return null
      }
      get rootMargin() {
        return ''
      }
      get thresholds() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    let loaded = 0
    const cleanup = hydrateIslands({
      PreIdleNative: () => {
        loaded++
        return Promise.resolve({ default: () => h('div', null) })
      },
    })

    expect(typeof scheduled).toBe('function')
    cleanup()
    expect(cancelledId).toBe(99)

    delete (window as unknown as Record<string, unknown>).requestIdleCallback
    delete (window as unknown as Record<string, unknown>).cancelIdleCallback
    globalThis.IntersectionObserver = origIO
  })

  // ─── Interaction strategy tests ─────────────────────────────────────────

  test('interaction: stamps awaiting-interaction marker, hydrates on first click + replays', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="CmdPalette" data-hydrate="interaction" data-props="{}">' +
      '<button data-testid="trigger" type="button">open</button>' +
      '</pyreon-island>'

    let loaded = 0
    let liveClicks = 0
    const Live: ComponentFn = () => {
      const onClick = () => {
        liveClicks++
      }
      return h('button', { 'data-testid': 'trigger', type: 'button', onClick }, 'open')
    }

    const cleanup = hydrateIslands({
      CmdPalette: () => {
        loaded++
        return Promise.resolve({ default: Live })
      },
    })

    const island = document.querySelector('pyreon-island')!
    expect(island.getAttribute('data-island-state')).toBe('awaiting-interaction')
    expect(loaded).toBe(0)

    // First click — stops propagation, triggers hydration, captures replay path.
    const btn = island.querySelector<HTMLElement>('[data-testid="trigger"]')!
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(loaded).toBe(1)
    // After hydration, replay fires the live handler exactly once.
    expect(liveClicks).toBe(1)
    expect(island.getAttribute('data-island-state')).toBeNull()

    cleanup()
  })

  test('interaction: form submit hydrates + prevents browser nav + replays submit on live form', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="NewsletterForm" data-hydrate="interaction" data-props="{}">' +
      '<form data-testid="newsletter" action="/subscribe" method="post">' +
      '<input name="email" value="a@b.co" />' +
      '<button type="submit">Sign up</button>' +
      '</form>' +
      '</pyreon-island>'

    let loaded = 0
    let liveSubmits = 0
    let lastSubmittedEmail = ''
    const Live: ComponentFn = () => {
      const onSubmit = (e: Event) => {
        e.preventDefault()
        liveSubmits++
        const form = e.target as HTMLFormElement
        const fd = new FormData(form)
        lastSubmittedEmail = String(fd.get('email') ?? '')
      }
      return h(
        'form',
        { 'data-testid': 'newsletter', action: '/subscribe', method: 'post', onSubmit },
        h('input', { name: 'email', value: 'a@b.co' }),
        h('button', { type: 'submit' }, 'Sign up'),
      )
    }

    const cleanup = hydrateIslands({
      NewsletterForm: () => {
        loaded++
        return Promise.resolve({ default: Live })
      },
    })

    const island = document.querySelector('pyreon-island')!
    expect(island.getAttribute('data-island-state')).toBe('awaiting-interaction')

    // Browser default for submit is to navigate. Without our pre-hydrate
    // capture, the page would POST to /subscribe BEFORE the live handler
    // ever mounts. We inspect the dispatched event's `defaultPrevented`
    // flag directly — `stopImmediatePropagation` on the island-root
    // capture-phase handler intentionally blocks any same-element
    // listeners that would otherwise observe it.
    const form = island.querySelector<HTMLFormElement>('[data-testid="newsletter"]')!
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(submitEvent)
    expect(submitEvent.defaultPrevented).toBe(true)
    await new Promise((r) => setTimeout(r, 30))

    expect(loaded).toBe(1)
    // After hydration the live handler fires exactly once (the replayed submit)
    expect(liveSubmits).toBe(1)
    // The form data flows through correctly (FormData reads current input value)
    expect(lastSubmittedEmail).toBe('a@b.co')
    expect(island.getAttribute('data-island-state')).toBeNull()

    cleanup()
  })

  test('interaction: focus event hydrates without click replay', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="MenuFocus" data-hydrate="interaction" data-props="{}">' +
      '<button type="button">menu</button>' +
      '</pyreon-island>'

    let loaded = 0
    const cleanup = hydrateIslands({
      MenuFocus: () => {
        loaded++
        return Promise.resolve({ default: () => h('button', null, 'menu') })
      },
    })

    const btn = document.querySelector<HTMLElement>('pyreon-island button')!
    btn.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(loaded).toBe(1)

    cleanup()
  })

  test('interaction(<events>): only listed events trigger hydration', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="OnlyClick" data-hydrate="interaction(click)" data-props="{}">' +
      '<button type="button">x</button>' +
      '</pyreon-island>'

    let loaded = 0
    const cleanup = hydrateIslands({
      OnlyClick: () => {
        loaded++
        return Promise.resolve({ default: () => h('button', null, 'x') })
      },
    })

    const btn = document.querySelector<HTMLElement>('pyreon-island button')!
    // Focus is NOT in the list — must not trigger hydration.
    btn.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(loaded).toBe(0)
    // Click IS in the list — fires it.
    btn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(loaded).toBe(1)

    cleanup()
  })

  test('interaction(): empty event list falls back to defaults', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Defaults" data-hydrate="interaction()" data-props="{}">' +
      '<button type="button">x</button>' +
      '</pyreon-island>'

    let loaded = 0
    const cleanup = hydrateIslands({
      Defaults: () => {
        loaded++
        return Promise.resolve({ default: () => h('button', null, 'x') })
      },
    })

    const btn = document.querySelector<HTMLElement>('pyreon-island button')!
    btn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(loaded).toBe(1)

    cleanup()
  })

  test('interaction: cleanup() before any interaction removes listeners + clears marker', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="EarlyCancel" data-hydrate="interaction" data-props="{}">' +
      '<button type="button">x</button>' +
      '</pyreon-island>'

    let loaded = 0
    const cleanup = hydrateIslands({
      EarlyCancel: () => {
        loaded++
        return Promise.resolve({ default: () => h('button', null, 'x') })
      },
    })

    const island = document.querySelector('pyreon-island')!
    expect(island.getAttribute('data-island-state')).toBe('awaiting-interaction')
    cleanup()
    expect(island.getAttribute('data-island-state')).toBeNull()

    // Click after cleanup — listener has been removed, must not load.
    const btn = island.querySelector<HTMLElement>('button')!
    btn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(loaded).toBe(0)
  })

  test('interaction: click replay falls back to tag+child-index path when no testid', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="NoTestid" data-hydrate="interaction" data-props="{}">' +
      '<div><button type="button">x</button></div>' +
      '</pyreon-island>'

    let loaded = 0
    let liveClicks = 0
    const Live: ComponentFn = () => {
      const onClick = () => {
        liveClicks++
      }
      // Same DOM shape so the path resolves: pyreon-island > div > button
      return h('div', null, h('button', { type: 'button', onClick }, 'x'))
    }

    const cleanup = hydrateIslands({
      NoTestid: () => {
        loaded++
        return Promise.resolve({ default: Live })
      },
    })

    const btn = document.querySelector<HTMLElement>('pyreon-island button')!
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    expect(loaded).toBe(1)
    expect(liveClicks).toBe(1)

    cleanup()
  })

  test('interaction: replay path returns null when live tree shape differs (no replay fired)', async () => {
    // SSR shape: pyreon-island > div > button
    document.body.innerHTML =
      '<pyreon-island data-component="ShapeMismatch" data-hydrate="interaction" data-props="{}">' +
      '<div><button type="button">x</button></div>' +
      '</pyreon-island>'

    let liveClicks = 0
    // Live shape: pyreon-island > section (not div) > button — captured path
    // expects tag=DIV at step 0, finds SECTION instead. resolveReplayPath
    // returns null, liveTarget guard skips replay.
    const Live: ComponentFn = () =>
      h(
        'section',
        null,
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              liveClicks++
            },
          },
          'x',
        ),
      )

    const cleanup = hydrateIslands({
      ShapeMismatch: () => Promise.resolve({ default: Live }),
    })

    const btn = document.querySelector<HTMLElement>('pyreon-island button')!
    btn.click()
    await new Promise((r) => setTimeout(r, 30))
    // No replay because the path resolves to null (tag mismatch).
    expect(liveClicks).toBe(0)

    cleanup()
  })

  test('interaction: non-click event triggers hydrate without setting replayPath', async () => {
    // pointerenter is a non-click event; it kicks off hydration but no replay.
    document.body.innerHTML =
      '<pyreon-island data-component="HoverOnly" data-hydrate="interaction" data-props="{}">' +
      '<button type="button">x</button>' +
      '</pyreon-island>'

    let loaded = 0
    let liveClicks = 0
    const Live: ComponentFn = () =>
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            liveClicks++
          },
        },
        'x',
      )
    const cleanup = hydrateIslands({
      HoverOnly: () => {
        loaded++
        return Promise.resolve({ default: Live })
      },
    })

    const btn = document.querySelector<HTMLElement>('pyreon-island button')!
    btn.dispatchEvent(new Event('pointerenter', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    expect(loaded).toBe(1)
    // No click was fired — no replay.
    expect(liveClicks).toBe(0)

    cleanup()
  })

  test('marks islands with hydration failure as data-island-error="hydration-failed"', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Crash" data-props="{}"></pyreon-island>'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Crash: () => Promise.reject(new Error('boom')),
    })
    await new Promise((r) => setTimeout(r, 50))

    const el = document.querySelector('pyreon-island')!
    expect(el.getAttribute('data-island-error')).toBe('hydration-failed')

    errorSpy.mockRestore()
    cleanup()
  })
})

// ─── perf counter emissions ─────────────────────────────────────────────────

/**
 * Runtime gate for the 7 `island.*` counters. The catalog-drift test in
 * @pyreon/perf-harness only proves the EMIT STRINGS exist in source; this
 * suite installs a counter sink and asserts each emit actually FIRES at
 * the right moment under each strategy. Without this, a typo (`'island.hyrated'`
 * vs `'island.hydrated'`) that's also typo'd in COUNTERS.md would scan-clean
 * and ship silently dead.
 *
 * Each test bisect-verifies its specific counter — remove the matching
 * `_countSink.__pyreon_count__?.('X')` line in client.ts and the assertion
 * here flips from `1` to `0` (or the matching count).
 */
describe('island.* counter emissions', () => {
  let counts: Map<string, number>
  let savedSink: ((name: string, n?: number) => void) | undefined

  beforeEach(() => {
    document.body.innerHTML = ''
    counts = new Map<string, number>()
    const g = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }
    savedSink = g.__pyreon_count__
    g.__pyreon_count__ = (name: string, n = 1) => {
      counts.set(name, (counts.get(name) ?? 0) + n)
    }
  })

  afterEach(() => {
    const g = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }
    if (savedSink) g.__pyreon_count__ = savedSink
    else delete g.__pyreon_count__
  })

  test('island.scheduled fires once per scheduled island', async () => {
    document.body.innerHTML = [
      '<pyreon-island data-component="A" data-props="{}"></pyreon-island>',
      '<pyreon-island data-component="B" data-props="{}"></pyreon-island>',
    ].join('')
    const Comp: ComponentFn = () => h('div', null, 'x')

    const cleanup = hydrateIslands({
      A: () => Promise.resolve({ default: Comp }),
      B: () => Promise.resolve({ default: Comp }),
    })
    await new Promise((r) => setTimeout(r, 50))

    expect(counts.get('island.scheduled')).toBe(2)
    cleanup()
  })

  test('island.hydrated fires once per successful hydration', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="C" data-props=\'{"v":1}\'></pyreon-island>'
    const C: ComponentFn = () => h('button', null, 'c')

    const cleanup = hydrateIslands({
      C: () => Promise.resolve({ default: C }),
    })
    await new Promise((r) => setTimeout(r, 50))

    expect(counts.get('island.hydrated')).toBe(1)
    cleanup()
  })

  test('island.skipped.never fires once per never-strategy island', async () => {
    document.body.innerHTML = [
      '<pyreon-island data-component="N1" data-hydrate="never" data-props="{}"></pyreon-island>',
      '<pyreon-island data-component="N2" data-hydrate="never" data-props="{}"></pyreon-island>',
    ].join('')

    const cleanup = hydrateIslands({})
    await new Promise((r) => setTimeout(r, 30))

    expect(counts.get('island.skipped.never')).toBe(2)
    expect(counts.get('island.scheduled') ?? 0).toBe(0) // never-islands never proceed to schedule
    cleanup()
  })

  test('island.skipped.no-loader fires for unregistered names', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Missing" data-props="{}"></pyreon-island>'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cleanup = hydrateIslands({})
    expect(counts.get('island.skipped.no-loader')).toBe(1)
    warnSpy.mockRestore()
    cleanup()
  })

  test('island.error fires for invalid props JSON', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Bad" data-props="not valid json"></pyreon-island>'
    const Bad: ComponentFn = () => h('div', null)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Bad: () => Promise.resolve({ default: Bad }),
    })
    await new Promise((r) => setTimeout(r, 50))

    expect(counts.get('island.error')).toBe(1)
    errorSpy.mockRestore()
    cleanup()
  })

  test('island.error fires for hydration failure', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="Crash" data-props="{}"></pyreon-island>'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cleanup = hydrateIslands({
      Crash: () => Promise.reject(new Error('boom')),
    })
    await new Promise((r) => setTimeout(r, 50))

    expect(counts.get('island.error')).toBe(1)
    errorSpy.mockRestore()
    cleanup()
  })

  test('island.prefetch fires per pre-warm loader call (idle strategy)', async () => {
    document.body.innerHTML =
      '<pyreon-island data-component="P" data-hydrate="visible" data-prefetch="idle" data-props="{}"></pyreon-island>'
    const P: ComponentFn = () => h('div', null, 'p')

    const cleanup = hydrateIslands({
      P: () => Promise.resolve({ default: P }),
    })
    // Wait for requestIdleCallback fallback timer
    await new Promise((r) => setTimeout(r, 250))

    expect(counts.get('island.prefetch') ?? 0).toBeGreaterThanOrEqual(1)
    cleanup()
  })

  test('counters do NOT fire when sink is undefined (graceful no-op)', async () => {
    const g = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }
    delete g.__pyreon_count__ // remove the sink installed in beforeEach

    document.body.innerHTML = '<pyreon-island data-component="Q" data-props="{}"></pyreon-island>'
    const Q: ComponentFn = () => h('div', null, 'q')

    // Should not throw — the optional-chain short-circuits.
    const cleanup = hydrateIslands({
      Q: () => Promise.resolve({ default: Q }),
    })
    await new Promise((r) => setTimeout(r, 50))
    cleanup()
  })
})
