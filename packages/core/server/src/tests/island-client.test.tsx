// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { island } from '../island'

/**
 * Unit coverage for the CLIENT self-hydration branch of `island()`
 * (`island.ts` `if (typeof document !== 'undefined')`). The server's other
 * tests run in the Node env (document undefined) so they only exercise the
 * SERVER branch (renderToString into the marker); `islands.browser.test.tsx`
 * tests `scheduleHydration` against hand-built markers but never mounts the
 * `island()` wrapper. This file mounts the wrapper under happy-dom so the
 * client branch — marker render + `onMount` → dynamic `./client` import →
 * `schedulePrefetch`/`scheduleHydration` — actually executes (the end-to-end
 * behaviour is additionally covered by the `zero-islands` real-Chromium gate).
 *
 * NOTE: `pyreon-island` is a custom element (has a hyphen), so runtime-dom
 * sets `data-*` as PROPERTIES, not attributes — assert via property access,
 * not `getAttribute`. Hydration is driven by args passed to
 * `scheduleHydration` (not by reading the marker), so we don't assert the
 * hydrated child here (timing/observer-dependent — that's the e2e's job); we
 * assert the branch renders the marker + runs `onMount` without throwing.
 */
function prop(el: Element | null, key: string): unknown {
  return (el as unknown as Record<string, unknown> | null)?.[key]
}

describe("island() — client self-hydration branch", () => {
  it("renders the <pyreon-island> marker + runs onMount (hydrate: 'load', prefetch: none)", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const Counter = island(
      async () => ({
        default: () => h("button", { "data-testid": "isle-body" }, "hi"),
      }),
      { name: "ClientCounter", hydrate: "load" },
    )

    mount(h(Counter, { initial: 1 }), container)

    const marker = container.querySelector("pyreon-island")
    expect(marker).toBeTruthy()
    expect(prop(marker, "data-component")).toBe("ClientCounter")
    expect(prop(marker, "data-hydrate")).toBe("load")
    // No data-prefetch attr/prop for the default 'none'.
    expect(prop(marker, "data-prefetch")).toBeUndefined()

    // onMount → import('./client') → scheduleHydration. Let the dynamic
    // import + microtasks settle; the branch (incl. the .then body) must run
    // without throwing.
    await new Promise((r) => setTimeout(r, 50))
  })

  it("emits a prefetch hint + runs the prefetch path (hydrate: 'visible', prefetch: 'idle')", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const Lazy = island(
      async () => ({ default: () => h("span", { "data-testid": "lazy-body" }, "x") }),
      { name: "LazyIsle", hydrate: "visible", prefetch: "idle" },
    )

    mount(h(Lazy, null), container)

    const marker = container.querySelector("pyreon-island")
    expect(prop(marker, "data-component")).toBe("LazyIsle")
    // prefetch !== 'none' on a deferred strategy → the hint is emitted, and the
    // onMount body takes the `schedulePrefetch` branch.
    expect(prop(marker, "data-prefetch")).toBe("idle")
    await new Promise((r) => setTimeout(r, 30))
  })

  it("hydrate: 'never' renders an inert marker (no ref/onMount wiring)", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const Never = island(
      async () => ({ default: () => h("span", null, "never") }),
      { name: "NeverIsle", hydrate: "never" },
    )

    mount(h(Never, null), container)

    const marker = container.querySelector("pyreon-island")
    expect(marker).toBeTruthy()
    expect(prop(marker, "data-hydrate")).toBe("never")
    // Never-strategy ships no client JS — the marker stays inert.
    expect(marker?.children.length).toBe(0)
  })
})
