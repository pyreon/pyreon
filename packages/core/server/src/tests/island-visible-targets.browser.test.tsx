/**
 * Real-Chromium class table for `hydrate: 'visible'` (#4435): what the
 * trigger observes, for every host shape where "the island's element" and
 * "the island's box" are not the same thing.
 *
 * Rule (`client.ts:visibilityTargets`): observe the island's first elements
 * that generate a box, walking through `display: contents` at any depth (an
 * IntersectionObserver never reports a box-less target as intersecting). When
 * nothing under the island is an element that can have a box (a `contents`
 * host holding only text, or nothing), observe the nearest ancestor that has
 * one, and warn once in dev. Elements that are hidden now (`display: none`,
 * a closed `<details>`) are observed as they are: the observer fires when they
 * get a box, which is when they can be seen.
 *
 * The hydrated component renders `null`, so hydration claims nothing and the
 * test reads only whether the trigger fired (`data-island-hydrated`).
 */

import { userEvent } from 'vitest/browser'
import { query } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateIslands } from '../client'

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

const settle = async (n = 8) => {
  for (let i = 0; i < n; i++) await frame()
}

const hydrated = (el: Element) => el.hasAttribute('data-island-hydrated')

const waitHydrated = async (el: Element) => {
  for (let i = 0; i < 60 && !hydrated(el); i++) await frame()
  return hydrated(el)
}

let cleanup: (() => void) | null = null
let warn: ReturnType<typeof vi.spyOn>
const roots: HTMLElement[] = []

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  window.scrollTo(0, 0)
})

afterEach(() => {
  cleanup?.()
  cleanup = null
  for (const r of roots.splice(0)) r.remove()
  warn.mockRestore()
  window.scrollTo(0, 0)
})

/**
 * Put `html` 3000px below the fold inside a boxed stage. The island element
 * inside is `pyreon-island[data-component=Isle]`.
 */
const stage = (html: string, hydrate = 'visible'): { stage: HTMLElement; island: HTMLElement } => {
  const spacer = document.createElement('div')
  spacer.style.height = '3000px'
  const st = document.createElement('div')
  st.style.minHeight = '20px'
  st.innerHTML = html
  document.body.append(spacer, st)
  roots.push(spacer, st)
  const island = query<HTMLElement>(st, 'pyreon-island')
  island.setAttribute('data-component', 'Isle')
  island.setAttribute('data-props', '{}')
  island.setAttribute('data-hydrate', hydrate)

  return { stage: st, island }
}

const start = () => {
  cleanup = hydrateIslands({ Isle: async () => ({ default: () => null }) })
}

const reveal = async (el: Element) => {
  el.scrollIntoView({ behavior: 'instant', block: 'center' })
  await frame()
}

const islandWarnings = () =>
  warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes("hydrate: 'visible'")).length

describe("hydrate: 'visible' — hosts whose element is not their box (#4435)", () => {
  const scrollCases: [string, string][] = [
    ['contents host → boxed child', '<pyreon-island style="display:contents"><div>x</div></pyreon-island>'],
    [
      'contents host → contents wrapper → boxed grandchild (nested provider)',
      '<pyreon-island style="display:contents"><div style="display:contents" data-theme="dark"><button>x</button></div></pyreon-island>',
    ],
    [
      'three contents levels → boxed',
      '<pyreon-island style="display:contents"><div style="display:contents"><span style="display:contents"><b style="display:inline-block">x</b></span></div></pyreon-island>',
    ],
    [
      'boxed (default inline) host whose only child is contents',
      '<pyreon-island><div style="display:contents"><button>x</button></div></pyreon-island>',
    ],
    ['empty inline host (zero size until hydrated)', '<pyreon-island></pyreon-island>'],
    ['host with height: 0 and overflow: hidden', '<pyreon-island style="display:block;height:0;overflow:hidden"><p>x</p></pyreon-island>'],
    [
      'zero-height host with an absolutely positioned child',
      '<pyreon-island style="display:block;position:relative;height:0"><div style="position:absolute;top:0;height:40px">x</div></pyreon-island>',
    ],
    ['visibility: hidden host (has a box)', '<pyreon-island style="display:block;visibility:hidden"><p>x</p></pyreon-island>'],
    ['content-visibility: auto host', '<pyreon-island style="display:block;content-visibility:auto"><p>x</p></pyreon-island>'],
  ]

  for (const [name, html] of scrollCases) {
    it(`${name}: pending below the fold, hydrates when scrolled in, no warning`, async () => {
      const { stage: st, island } = stage(html)
      start()
      await settle()
      expect(hydrated(island)).toBe(false)
      await reveal(st)
      expect(await waitHydrated(island)).toBe(true)
      expect(islandWarnings()).toBe(0)
    })
  }

  it('contents host holding only text: observes the nearest boxed ancestor and warns once in dev', async () => {
    const a = stage('<pyreon-island style="display:contents">just text</pyreon-island>')
    const b = stage('<pyreon-island style="display:contents"></pyreon-island>')
    b.island.setAttribute('data-component', 'Isle')
    start()
    await settle()
    expect(hydrated(a.island)).toBe(false)
    expect(hydrated(b.island)).toBe(false)
    await reveal(a.stage)
    expect(await waitHydrated(a.island)).toBe(true)
    await reveal(b.stage)
    expect(await waitHydrated(b.island)).toBe(true)
    // Once, not once per island.
    expect(islandWarnings()).toBe(1)
    expect(String(warn.mock.calls.find((c: unknown[]) => String(c[0]).includes("hydrate: 'visible'"))?.[0])).toMatch(
      /^\[Pyreon\] .*Isle/,
    )
  })

  it('inside a closed <details>: stays pending while closed, hydrates once opened', async () => {
    const { stage: st, island } = stage('<details><summary>more</summary><pyreon-island><p>x</p></pyreon-island></details>')
    start()
    await reveal(st)
    await settle()
    expect(hydrated(island)).toBe(false)
    query<HTMLDetailsElement>(st, 'details').open = true
    await reveal(query<HTMLElement>(island, 'p'))
    expect(await waitHydrated(island)).toBe(true)
    expect(islandWarnings()).toBe(0)
  })

  it('inside display: none that later shows: stays pending while hidden, hydrates when shown', async () => {
    const { stage: st, island } = stage('<div class="wrap" style="display:none"><pyreon-island><p>x</p></pyreon-island></div>')
    start()
    await reveal(st)
    await settle()
    expect(hydrated(island)).toBe(false)
    query<HTMLElement>(st, '.wrap').style.display = 'block'
    expect(await waitHydrated(island)).toBe(true)
  })

  it('contents host whose content is display: none at this width: stays pending without a warning, hydrates when shown', async () => {
    const { stage: st, island } = stage('<pyreon-island style="display:contents"><div class="v" style="display:none">x</div></pyreon-island>')
    start()
    await reveal(st)
    await settle()
    expect(hydrated(island)).toBe(false)
    expect(islandWarnings()).toBe(0)
    query<HTMLElement>(st, '.v').style.display = 'block'
    expect(await waitHydrated(island)).toBe(true)
  })

  for (const [name, host] of [
    ['boxed host', '<pyreon-island><p>x</p></pyreon-island>'],
    ['nested contents host', '<pyreon-island style="display:contents"><div style="display:contents"><p>x</p></div></pyreon-island>'],
  ]) {
    it(`inside a scroll container (${name}): pending until scrolled into the container's visible area`, async () => {
      const { stage: st, island } = stage(
        `<div class="sc" style="height:120px;overflow:auto"><div style="height:2000px"></div>${host}</div>`,
      )
      start()
      await reveal(st)
      await settle()
      expect(hydrated(island)).toBe(false)
      const sc = query<HTMLElement>(st, '.sc')
      sc.scrollTop = sc.scrollHeight
      expect(await waitHydrated(island)).toBe(true)
    })
  }
})

describe("hydrate: 'interaction' on a box-less host (#4435 sibling check)", () => {
  // The interaction listeners sit on the island element in the capture phase.
  // Event paths follow the DOM, not boxes, so a `display: contents` host still
  // sees its descendants' events.
  const html =
    '<pyreon-island style="display:contents"><div style="display:contents"><button data-testid="b">x</button></div></pyreon-island>'

  it('a click on the boxed grandchild hydrates', async () => {
    const { stage: st, island } = stage(html, 'interaction')
    start()
    await reveal(st)
    await userEvent.click(query<HTMLElement>(st, '[data-testid="b"]'))
    expect(await waitHydrated(island)).toBe(true)
  })

  it('focus on the boxed grandchild hydrates', async () => {
    const { stage: st, island } = stage(html, 'interaction')
    start()
    await reveal(st)
    query<HTMLElement>(st, '[data-testid="b"]').focus()
    expect(await waitHydrated(island)).toBe(true)
  })

  it('a real pointer entering the boxed grandchild hydrates (pointerenter reaches the contents host)', async () => {
    const { stage: st, island } = stage(html, 'interaction(pointerenter)')
    start()
    await reveal(st)
    await userEvent.hover(query<HTMLElement>(st, '[data-testid="b"]'))
    expect(await waitHydrated(island)).toBe(true)
  })
})

describe("prefetch: 'visible' follows the same targets", () => {
  it('nested contents: the chunk is prefetched when the boxed grandchild nears the viewport', async () => {
    const { stage: st, island } = stage(
      '<pyreon-island style="display:contents"><div style="display:contents"><button>x</button></div></pyreon-island>',
      'media((min-width: 99999px))',
    )
    island.setAttribute('data-prefetch', 'visible')
    let loads = 0
    cleanup = hydrateIslands({
      Isle: async () => {
        loads++
        return { default: () => null }
      },
    })
    await settle()
    expect(loads).toBe(0)
    await reveal(st)
    for (let i = 0; i < 60 && loads === 0; i++) await frame()
    expect(loads).toBe(1)
  })
})
