// Per-tab back stacks — `createRouter({ tabs })` + `<Tabs router>` (#4060).
//
// iOS: the RouterProvider adds no stack; `<Tabs router>` lowers to
// `PyreonRouterTabs` (selection = the router's active tab, a write goes
// through `selectTab`), and each `<Tab>`'s `<RouterView />` becomes the tab's
// own `PyreonTabStack` — a `NavigationStack` bound to that tab's entries,
// opening on the route at the tab's root and carrying the whole route
// dispatch. Android: router-driven `PyreonTabs` (re-tap → `selectTab`) and a
// `PyreonTabStack` whose dispatch reads `router.tabTop("<tab>")`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const SRC = readFileSync(join(import.meta.dirname, '../fixtures/router-tabs.tsx'), 'utf8')

describe('router tabs — Swift emit', () => {
  const out = transform(SRC, { target: 'swift' })
  it('constructs the router with its tabs', () => {
    expect(out.code).toContain(
      '@State private var router = PyreonRouter(tabs: [PyreonRouterTab(name: "feed", root: "/feed"), PyreonRouterTab(name: "me", root: "/me")])',
    )
  })
  it('binds the tab bar to the router and gives each tab its own stack', () => {
    expect(out.code).toContain('PyreonRouterTabs(router: router, items: [')
    expect(out.code).toContain('PyreonTabItem(value: "feed", label: "Feed", systemImage: "house.fill")')
    expect(out.code).toMatch(/case "feed":\s+PyreonTabStack\(router: router, tab: "feed"\) \{\s+FeedHome\(\)\.frame\(maxWidth: \.infinity, maxHeight: \.infinity, alignment: \.topLeading\)\s+\.navigationDestination\(for: String\.self\)/)
    expect(out.code).toMatch(/case "me":\s+PyreonTabStack\(router: router, tab: "me"\) \{\s+MeHome\(\)/)
  })
  it('emits no warnings', () => {
    expect(out.warnings).toEqual([])
  })
  it.skipIf(!isSwiftcAvailable())('typechecks against the stubs', () => {
    const res = validateSwiftWithStubs(out.code)
    expect(res.ok, res.error).toBe(true)
  })
})

describe('router tabs — Kotlin emit', () => {
  const out = transform(SRC, { target: 'kotlin' })
  it('constructs the router with its tabs', () => {
    expect(out.code).toContain(
      'val router = remember { PyreonRouter(tabs = listOf(PyreonRouterTab("feed", "/feed"), PyreonRouterTab("me", "/me"))) }',
    )
  })
  it('drives PyreonTabs from the router, re-tap included', () => {
    expect(out.code).toContain('selected = router.activeTab.value ?: "feed"')
    expect(out.code).toContain('onSelect = { router.selectTab(it) }')
    expect(out.code).toContain('onReselect = { router.selectTab(it) }')
  })
  it('dispatches each tab on ITS OWN top entry', () => {
    expect(out.code).toContain('PyreonTabStack(router, "feed") {')
    expect(out.code).toContain('val currentPath = router.tabTop("feed")')
    expect(out.code).toContain('val currentPath = router.tabTop("me")')
  })
  it('emits no warnings', () => {
    expect(out.warnings).toEqual([])
  })
  it.skipIf(!isKotlincAvailable())('compiles on kotlinc', () => {
    const res = validateKotlin(out.code)
    expect(res.ok, res.error).toBe(true)
  })
})
