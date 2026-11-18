import { describe, expect, it } from 'vitest'
import * as hooks from '@pyreon/hooks'
import { presets } from '@pyreon/kinetic-presets'
import * as components from '@pyreon/ui-components'
import { LIBRARY_COUNTS, categoryCount, componentDemoCount } from '../home-stats'

// The home page used to hand-type "75 UI Components" while the library had
// grown past 100 (#4268). These lock each stated number to its source.
describe('home page stats match the libraries', () => {
  it('components = the component exports of @pyreon/ui-components', () => {
    const exported = Object.entries(components).filter(
      ([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function',
    )
    expect(LIBRARY_COUNTS.components).toBe(exported.length)
  })

  it('presets = the entries of @pyreon/kinetic-presets `presets`', () => {
    expect(LIBRARY_COUNTS.presets).toBe(Object.keys(presets).length)
  })

  it('hooks = the use* exports of @pyreon/hooks', () => {
    expect(LIBRARY_COUNTS.hooks).toBe(Object.keys(hooks).filter((n) => /^use[A-Z]/.test(n)).length)
  })

  it('demo and category counts come from the sidebar', () => {
    expect(categoryCount).toBe(11)
    expect(componentDemoCount).toBe(39)
  })
})
