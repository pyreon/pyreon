// @vitest-environment happy-dom
/**
 * `hydrateIslands(registry, { root })` (#4371): a standalone island (one with
 * no app around it, as on an islands-only page) hydrates as its own root, so a
 * component inside it that reads context (a theme) finds no provider. `root`
 * is the app's answer: a component that wraps every island in its providers.
 *
 * It is loaded once, with the first island that hydrates (a page with no
 * islands never downloads it), and it must render only its children, so the
 * island still ADOPTS its server HTML.
 */
import type { VNodeChild } from '@pyreon/core'
import { createContext, h, provide, useContext } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrateIslands, hydrateIslandsAuto } from '../client'

const Theme = createContext<string>('none')

function ThemeRoot(props: { children?: VNodeChild }) {
  provide(Theme, 'dark')
  return props.children ?? null
}

function Themed() {
  return h('b', { 'data-testid': 'themed' }, `theme:${useContext(Theme)}`)
}

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 5))
  expect(cond()).toBe(true)
}

const marker = (html: string) => {
  const el = document.createElement('pyreon-island')
  el.setAttribute('data-component', 'Themed')
  el.setAttribute('data-props', '{}')
  el.setAttribute('data-hydrate', 'load')
  el.innerHTML = html
  document.body.appendChild(el)

  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('hydrateIslands — root', () => {
  it('wraps the island in the root, so its components read the root context', async () => {
    const el = marker('<b data-testid="themed">theme:dark</b>')
    const cleanup = hydrateIslands(
      { Themed: async () => ({ default: Themed }) },
      {
        root: async () => ({ default: ThemeRoot }),
      },
    )
    await until(() => el.hasAttribute('data-island-hydrated'))
    expect(el.textContent).toBe('theme:dark')
    cleanup()
  })

  it('the island adopts its server HTML through the root (same element, not rebuilt)', async () => {
    const el = marker('<b data-testid="themed">theme:dark</b>')
    const serverNode = el.firstChild
    const cleanup = hydrateIslands(
      { Themed: async () => ({ default: Themed }) },
      {
        root: async () => ({ default: ThemeRoot }),
      },
    )
    await until(() => el.hasAttribute('data-island-hydrated'))
    expect(el.firstChild).toBe(serverNode)
    cleanup()
  })

  it('without a root the island has no provider (the case the option exists for)', async () => {
    const el = marker('<b data-testid="themed">theme:none</b>')
    const cleanup = hydrateIslands({ Themed: async () => ({ default: Themed }) })
    await until(() => el.hasAttribute('data-island-hydrated'))
    expect(el.textContent).toBe('theme:none')
    cleanup()
  })

  it('loads the root once for any number of islands, and not at all with no islands', async () => {
    let loads = 0
    const root = async () => {
      loads++
      return { default: ThemeRoot }
    }
    hydrateIslands({ Themed: async () => ({ default: Themed }) }, { root })()
    expect(loads).toBe(0)

    const a = marker('<b data-testid="themed">theme:dark</b>')
    const b = marker('<b data-testid="themed">theme:dark</b>')
    const cleanup = hydrateIslands({ Themed: async () => ({ default: Themed }) }, { root })
    await until(
      () => a.hasAttribute('data-island-hydrated') && b.hasAttribute('data-island-hydrated'),
    )
    expect(loads).toBe(1)
    cleanup()
  })

  it('hydrateIslandsAuto forwards the root', async () => {
    const el = marker('<b data-testid="themed">theme:dark</b>')
    const cleanup = hydrateIslandsAuto(
      {
        __pyreonIslandRegistry: { Themed: async () => ({ default: Themed }) },
        __pyreonIslandsEnabled: true,
      },
      { root: async () => ({ default: ThemeRoot }) },
    )
    await until(() => el.hasAttribute('data-island-hydrated'))
    expect(el.textContent).toBe('theme:dark')
    cleanup()
  })
})
