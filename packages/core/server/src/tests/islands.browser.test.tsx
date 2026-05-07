/**
 * Real-Chromium smoke tests for `hydrateIslands()`.
 *
 * What this catches that the existing happy-dom unit tests CAN'T:
 *
 *   - `IntersectionObserver` timing (real Chromium fires it; happy-dom
 *     doesn't ship a working impl).
 *   - `requestIdleCallback` availability + timing.
 *   - `matchMedia` real query matching against the actual viewport.
 *   - Real custom-element behavior on `<pyreon-island>`.
 *   - Real hydration replacing the SSR'd children with the live VNode tree.
 *   - The `data-island-error` markers landing on the right element under
 *     real rendering / real timing.
 */

import type { ComponentFn } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { hydrateIslands } from '../client'

const flushFrames = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(() => requestAnimationFrame(() => resolve()))
  })

const settle = async (loops = 5) => {
  for (let i = 0; i < loops; i++) await flushFrames()
}

interface IslandHostOptions {
  hydrate: string
  props?: Record<string, unknown>
  componentName?: string
  initialHtml?: string
}

const installIsland = ({
  hydrate,
  props = {},
  componentName = 'Counter',
  initialHtml = '<span data-testid="ssr-children">SSR children</span>',
}: IslandHostOptions): HTMLElement => {
  const island = document.createElement('pyreon-island') as HTMLElement
  island.setAttribute('data-component', componentName)
  island.setAttribute('data-props', JSON.stringify(props))
  island.setAttribute('data-hydrate', hydrate)
  island.innerHTML = initialHtml
  document.body.appendChild(island)
  return island
}

const cleanupIslands = (): void => {
  for (const el of document.querySelectorAll('pyreon-island')) el.remove()
}

describe('@pyreon/server — hydrateIslands in real Chromium', () => {
  it('hydrate=load: hydrates the component immediately and binds event handlers', async () => {
    // The SSR children inside <pyreon-island> are what the server-rendered
    // component output looks like; on the client we hydrate by binding the
    // live VNode tree to the existing DOM. Match the SSR shape to the VNode
    // shape so hydrateRoot can attach the click handler.
    const island = installIsland({
      hydrate: 'load',
      props: { initial: 7 },
      initialHtml: '<button data-testid="real-counter" type="button">7</button>',
    })

    // Note: this test file is compiled by vite's oxc JSX transform (not
    // Pyreon's compiler), so signal auto-call does NOT apply. Reactive reads
    // must be wrapped in an explicit accessor `{() => signal()}`.
    const Counter: ComponentFn = (props) => {
      const count = signal((props.initial as number) ?? 0)
      return (
        <button
          data-testid="real-counter"
          type="button"
          onClick={() => count.set(count() + 1)}
        >
          {() => String(count())}
        </button>
      )
    }

    const cleanup = hydrateIslands({
      Counter: () => Promise.resolve({ default: Counter }),
    })

    await settle()
    const btn = island.querySelector<HTMLButtonElement>('[data-testid="real-counter"]')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toBe('7')

    // hydrateRoot may replace SSR DOM with the live VNode tree — re-query
    // to find the (potentially) new node that has the click handler bound.
    btn?.click()
    await settle()
    const liveBtn = island.querySelector<HTMLButtonElement>('[data-testid="real-counter"]')
    // If the original captured node is still attached, click it; otherwise the
    // live one already received the dispatch.
    if (liveBtn && liveBtn !== btn) liveBtn.click()
    await settle()
    expect(liveBtn?.textContent).toBe('8')

    cleanup()
    cleanupIslands()
  })

  it('hydrate=visible: stays SSR-only until IntersectionObserver fires, then hydrates', async () => {
    // Push the island below the fold so it isn't initially in view.
    const spacer = document.createElement('div')
    spacer.style.height = '5000px'
    document.body.appendChild(spacer)

    const island = installIsland({
      hydrate: 'visible',
      componentName: 'Comments',
    })

    let loaderCalled = false
    const Comments = () => <div data-testid="real-comments">comments loaded</div>

    const cleanup = hydrateIslands({
      Comments: () => {
        loaderCalled = true
        return Promise.resolve({ default: Comments })
      },
    })

    // Without scrolling, the loader must NOT have been called yet.
    await settle()
    expect(loaderCalled).toBe(false)
    expect(island.querySelector('[data-testid="ssr-children"]')).not.toBeNull()

    // Scroll into view → IntersectionObserver fires → loader runs.
    island.scrollIntoView({ behavior: 'instant', block: 'center' })
    // IntersectionObserver dispatches asynchronously — needs a few frames
    // before the callback fires AND the dynamic import resolves.
    for (let i = 0; i < 30; i++) {
      await flushFrames()
      if (loaderCalled && island.querySelector('[data-testid="real-comments"]')) break
    }
    expect(loaderCalled).toBe(true)
    expect(island.querySelector('[data-testid="real-comments"]')).not.toBeNull()

    cleanup()
    cleanupIslands()
    spacer.remove()
  })

  it('hydrate=media(...): only fires when matchMedia(query).matches is true', async () => {
    // Use a query guaranteed to be true in headless Chromium.
    const island = installIsland({
      hydrate: 'media((min-width: 1px))',
      componentName: 'Menu',
    })

    let loaderCalled = false
    const cleanup = hydrateIslands({
      Menu: () => {
        loaderCalled = true
        return Promise.resolve({ default: () => <div data-testid="menu-real">menu</div> })
      },
    })

    await settle()
    expect(loaderCalled).toBe(true)
    expect(island.querySelector('[data-testid="menu-real"]')).not.toBeNull()

    cleanup()
    cleanupIslands()
  })

  it('hydrate=never: never loads and leaves SSR children intact', async () => {
    const island = installIsland({
      hydrate: 'never',
      componentName: 'Static',
    })

    let loaderCalled = false
    const cleanup = hydrateIslands({
      Static: () => {
        loaderCalled = true
        return Promise.resolve({ default: () => <div>nope</div> })
      },
    })

    await settle()
    expect(loaderCalled).toBe(false)
    expect(island.querySelector('[data-testid="ssr-children"]')?.textContent).toBe(
      'SSR children',
    )

    cleanup()
    cleanupIslands()
  })

  it('hydrate=interaction: stays SSR-only until first focus/click/pointerenter; one-shot', async () => {
    const island = installIsland({
      hydrate: 'interaction',
      componentName: 'CmdK',
    })

    let loaderCalls = 0
    const cleanup = hydrateIslands({
      CmdK: () => {
        loaderCalls += 1
        return Promise.resolve({
          default: () => <div data-testid="cmdk-mounted">mounted</div>,
        })
      },
    })

    await settle()
    expect(loaderCalls).toBe(0)
    // Listeners attached — surfaced via data-island-state for assertions.
    expect(island.getAttribute('data-island-state')).toBe('awaiting-interaction')
    expect(island.querySelector('[data-testid="cmdk-mounted"]')).toBeNull()

    // First click triggers hydrate.
    island.click()
    for (let i = 0; i < 20; i++) {
      await flushFrames()
      if (island.querySelector('[data-testid="cmdk-mounted"]')) break
    }
    expect(loaderCalls).toBe(1)
    expect(island.querySelector('[data-testid="cmdk-mounted"]')).not.toBeNull()
    expect(island.getAttribute('data-island-state')).toBeNull()

    // Subsequent clicks must NOT re-fire the loader (one-shot listeners).
    island.click()
    island.click()
    island.click()
    await settle()
    expect(loaderCalls).toBe(1)

    cleanup()
    cleanupIslands()
  })

  it('hydrate=interaction(focus): only the named events trigger hydrate', async () => {
    const island = installIsland({
      hydrate: 'interaction(focus)',
      componentName: 'FocusOnly',
    })
    // Make the island actually focusable so dispatched focus event has a target.
    island.tabIndex = 0

    let loaderCalls = 0
    const cleanup = hydrateIslands({
      FocusOnly: () => {
        loaderCalls += 1
        return Promise.resolve({ default: () => <div>focused</div> })
      },
    })

    await settle()
    // A click should NOT trigger this strategy — only focus.
    island.click()
    await settle()
    expect(loaderCalls).toBe(0)

    // Focus DOES trigger.
    island.dispatchEvent(new FocusEvent('focus'))
    for (let i = 0; i < 20; i++) {
      await flushFrames()
      if (loaderCalls > 0) break
    }
    expect(loaderCalls).toBe(1)

    cleanup()
    cleanupIslands()
  })

  it('hydrate=interaction: cleanup() removes listeners before any interaction', async () => {
    const island = installIsland({
      hydrate: 'interaction',
      componentName: 'NeverInteracted',
    })

    let loaderCalls = 0
    const cleanup = hydrateIslands({
      NeverInteracted: () => {
        loaderCalls += 1
        return Promise.resolve({ default: () => <div>x</div> })
      },
    })

    await settle()
    expect(island.getAttribute('data-island-state')).toBe('awaiting-interaction')

    // Remove listeners BEFORE any interaction happens.
    cleanup()
    expect(island.getAttribute('data-island-state')).toBeNull()

    // Click after cleanup should NOT trigger the loader.
    island.click()
    await settle()
    expect(loaderCalls).toBe(0)

    cleanupIslands()
  })

  it('hydrate=never WITHOUT a registry entry stays clean (no data-island-error)', async () => {
    // The whole point of hydrate=never is shipping zero client JS — so the
    // user does NOT register a loader. Pre-fix the missing-loader check
    // fired for never-islands and stamped data-island-error="no-loader",
    // which surfaced as a bogus warning + attribute on legitimate static
    // content. Now never-strategy short-circuits before the registry check.
    const island = installIsland({
      hydrate: 'never',
      componentName: 'NotRegistered',
    })

    const cleanup = hydrateIslands({})

    await settle()
    expect(island.getAttribute('data-island-error')).toBeNull()
    // SSR children remain (they would anyway since never-strategy never
    // mounts; the assertion catches a regression where we'd still write
    // data-island-error even though we don't render).
    expect(island.querySelector('[data-testid="ssr-children"]')?.textContent).toBe(
      'SSR children',
    )

    cleanup()
    cleanupIslands()
  })

  it('flags nested islands with data-island-error="nested" and skips them', async () => {
    const outer = document.createElement('pyreon-island')
    outer.setAttribute('data-component', 'Outer')
    outer.setAttribute('data-props', '{}')
    outer.setAttribute('data-hydrate', 'load')

    const inner = document.createElement('pyreon-island')
    inner.setAttribute('data-component', 'Inner')
    inner.setAttribute('data-props', '{}')
    inner.setAttribute('data-hydrate', 'load')
    outer.appendChild(inner)
    document.body.appendChild(outer)

    let innerLoaded = false
    const cleanup = hydrateIslands({
      Outer: () => Promise.resolve({ default: () => <div data-testid="outer">outer</div> }),
      Inner: () => {
        innerLoaded = true
        return Promise.resolve({ default: () => <div>inner</div> })
      },
    })

    await settle()
    expect(innerLoaded).toBe(false)
    expect(inner.getAttribute('data-island-error')).toBe('nested')

    cleanup()
    cleanupIslands()
  })

  it('flags missing-loader islands with data-island-error="no-loader"', async () => {
    const island = installIsland({
      hydrate: 'load',
      componentName: 'Nonexistent',
    })

    const cleanup = hydrateIslands({})
    await settle()
    expect(island.getAttribute('data-island-error')).toBe('no-loader')

    cleanup()
    cleanupIslands()
  })

  it('prefetch=idle: pre-warms the loader BEFORE hydration trigger fires', async () => {
    // Push the island below the fold — `hydrate: 'visible'` would NOT have
    // hydrated it on mount. With `prefetch: 'idle'`, the loader still fires
    // during idle so the chunk is warm by scroll-in.
    const spacer = document.createElement('div')
    spacer.style.height = '5000px'
    document.body.appendChild(spacer)

    const island = document.createElement('pyreon-island') as HTMLElement
    island.setAttribute('data-component', 'PrefetchedComments')
    island.setAttribute('data-props', '{}')
    island.setAttribute('data-hydrate', 'visible')
    island.setAttribute('data-prefetch', 'idle')
    island.innerHTML = '<span data-testid="ssr-children">SSR children</span>'
    document.body.appendChild(island)

    let loaderCalls = 0
    const cleanup = hydrateIslands({
      PrefetchedComments: () => {
        loaderCalls++
        return Promise.resolve({ default: () => <div data-testid="comments">x</div> })
      },
    })

    // Wait for requestIdleCallback to fire. No scrolling yet — the island
    // is still below the fold. With prefetch=idle, the loader MUST run.
    for (let i = 0; i < 30; i++) {
      await flushFrames()
      if (loaderCalls > 0) break
    }
    expect(loaderCalls).toBe(1)
    // But hydration has NOT happened yet — SSR children remain.
    expect(island.querySelector('[data-testid="ssr-children"]')).not.toBeNull()
    expect(island.querySelector('[data-testid="comments"]')).toBeNull()

    cleanup()
    cleanupIslands()
    spacer.remove()
  })

  it('prefetch=visible: pre-warms the loader ~200px before viewport entry', async () => {
    const spacer = document.createElement('div')
    spacer.style.height = '5000px'
    document.body.appendChild(spacer)

    const island = document.createElement('pyreon-island') as HTMLElement
    island.setAttribute('data-component', 'PrefetchVisible')
    island.setAttribute('data-props', '{}')
    // Pair prefetch=visible with hydrate=media(query that won't match) so
    // hydration NEVER fires — isolating the prefetch path. (1px width can't
    // ever be true on a real browser viewport.)
    island.setAttribute('data-hydrate', 'media((max-width: 1px))')
    island.setAttribute('data-prefetch', 'visible')
    island.innerHTML = '<span data-testid="ssr-children">SSR children</span>'
    document.body.appendChild(island)

    let loaderCalls = 0
    const cleanup = hydrateIslands({
      PrefetchVisible: () => {
        loaderCalls++
        return Promise.resolve({ default: () => <div>x</div> })
      },
    })

    // Without scroll, the island is below the fold — prefetch=visible's
    // IntersectionObserver hasn't fired yet.
    await settle()
    expect(loaderCalls).toBe(0)

    // Scroll into view → IntersectionObserver fires → loader runs once.
    island.scrollIntoView({ behavior: 'instant', block: 'center' })
    for (let i = 0; i < 30; i++) {
      await flushFrames()
      if (loaderCalls > 0) break
    }
    expect(loaderCalls).toBe(1)
    // Hydration STILL hasn't happened (media query won't match on a real
    // viewport) — SSR children still in place. This proves prefetch and
    // hydration are independent.
    expect(island.querySelector('[data-testid="ssr-children"]')).not.toBeNull()

    cleanup()
    cleanupIslands()
    spacer.remove()
  })

  it('prefetch=none (default / unset): does NOT call loader before hydration trigger', async () => {
    const spacer = document.createElement('div')
    spacer.style.height = '5000px'
    document.body.appendChild(spacer)

    // No data-prefetch attribute at all — exercises the default-none path.
    const island = installIsland({
      hydrate: 'visible',
      componentName: 'NoPrefetch',
    })

    let loaderCalls = 0
    const cleanup = hydrateIslands({
      NoPrefetch: () => {
        loaderCalls++
        return Promise.resolve({ default: () => <div>x</div> })
      },
    })

    await settle()
    // Below the fold + no prefetch → loader must NOT have been called.
    expect(loaderCalls).toBe(0)
    expect(island.querySelector('[data-testid="ssr-children"]')).not.toBeNull()

    cleanup()
    cleanupIslands()
    spacer.remove()
  })

  it('flags invalid props JSON with data-island-error="invalid-props"', async () => {
    const island = document.createElement('pyreon-island') as HTMLElement
    island.setAttribute('data-component', 'BadProps')
    island.setAttribute('data-props', '{not-json')
    island.setAttribute('data-hydrate', 'load')
    document.body.appendChild(island)

    let loaderRan = false
    const cleanup = hydrateIslands({
      BadProps: () => {
        loaderRan = true
        return Promise.resolve({ default: () => <div>x</div> })
      },
    })

    await settle()
    // The JSON parse error short-circuits BEFORE the loader is called —
    // see hydrateIsland() in src/client.ts. So loaderRan stays false.
    expect(loaderRan).toBe(false)
    expect(island.getAttribute('data-island-error')).toBe('invalid-props')

    cleanup()
    cleanupIslands()
  })
})
