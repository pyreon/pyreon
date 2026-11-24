/**
 * `router-tabs-function`: `createRouter({ tabs: [...] })` → `createRouter({ tabs:
 * routerTabs([...]) })`, so the tab engine is bundled only by apps that use tabs.
 *
 * Bisect-verified: with the edit list cleared after the walk, every rewrite
 * spec returns `null`.
 */
import { describe, expect, it } from 'vitest'
import { CODEMODS, selectCodemods } from '../codemods'
import { routerTabsFunction } from '../codemods/router-tabs-function'

const run = (src: string, path = 'a.ts') => routerTabsFunction.transform(src, path)

describe('router-tabs-function', () => {
  it('wraps an array literal and adds routerTabs to the router import', () => {
    const src = `import { createRouter, RouterView } from '@pyreon/router'\nconst r = createRouter({\n  routes,\n  tabs: [\n    { name: 'feed', root: '/feed' },\n  ],\n})\n`
    expect(run(src)).toBe(
      `import { createRouter, RouterView, routerTabs } from '@pyreon/router'\nconst r = createRouter({\n  routes,\n  tabs: routerTabs([\n    { name: 'feed', root: '/feed' },\n  ]),\n})\n`,
    )
  })

  it('wraps a variable and expands the shorthand, following an aliased createRouter', () => {
    const src = `import { createRouter as cr } from '@pyreon/router'\nconst a = cr({ routes, tabs: TABS })\nconst b = cr({ routes, tabs })\n`
    expect(run(src)).toBe(
      `import { createRouter as cr, routerTabs } from '@pyreon/router'\nconst a = cr({ routes, tabs: routerTabs(TABS) })\nconst b = cr({ routes, tabs: routerTabs(tabs) })\n`,
    )
  })

  it('uses an existing (aliased) routerTabs import instead of adding one', () => {
    const src = `import { createRouter, routerTabs as rt } from '@pyreon/router'\ncreateRouter({ routes, tabs: [] })\n`
    expect(run(src, 'a.tsx')).toBe(`import { createRouter, routerTabs as rt } from '@pyreon/router'\ncreateRouter({ routes, tabs: rt([]) })\n`)
  })

  it('leaves migrated code, other functions and other packages alone', () => {
    expect(run(`import { createRouter, routerTabs } from '@pyreon/router'\ncreateRouter({ routes, tabs: routerTabs([]) })\n`)).toBeNull()
    expect(run(`import { createRouter } from '@pyreon/router'\nmakeTabs({ tabs: [] })\n`)).toBeNull()
    expect(run(`import { createRouter } from './my-router'\ncreateRouter({ routes, tabs: [] })\n`)).toBeNull()
  })

  it('is idempotent', () => {
    const once = run(`import { createRouter } from '@pyreon/router'\ncreateRouter({ routes, tabs: [] })\n`)!
    expect(run(once)).toBeNull()
  })

  it('is registered and selected for an upgrade that crosses 0.54.0', () => {
    expect(CODEMODS).toContain(routerTabsFunction)
    expect(selectCodemods('0.53.0', '0.54.0')).toContain(routerTabsFunction)
  })
})
