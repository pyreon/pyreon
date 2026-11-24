// @vitest-environment happy-dom
import type { ComponentFn } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isIslandName } from '../island-name'
import { _resetServerIslands, activateServerIslandElement, serverIsland } from '../server-island'
import { ISLAND_NAME_CASES } from './island-name.cases'

/**
 * Registration and the browser apply the SAME name rule (zero's endpoint is
 * checked against the same table in `zero/src/tests/island-name-endpoint.test.ts`).
 * Before, registration took anything but `''`/`.`/`..` while the endpoint
 * 400'd any `/`, so `shop/cart` registered and then silently never loaded.
 */
const Badge: ComponentFn = () => null

afterEach(() => {
  _resetServerIslands()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('island names: one rule for registration and the browser', () => {
  for (const [name, valid] of ISLAND_NAME_CASES) {
    it(`${JSON.stringify(name)} → ${valid ? 'accepted' : 'refused'}`, async () => {
      expect(isIslandName(name)).toBe(valid)
      const register = () => serverIsland(async () => Badge, { name })
      if (valid) expect(register).not.toThrow()
      else expect(register).toThrow(/\[Pyreon\] serverIsland: invalid name/)

      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const urls: string[] = []
      vi.stubGlobal('fetch', (u: string) => {
        urls.push(u)
        return Promise.resolve(new Response('<b>x</b>', { status: 200 }))
      })
      const el = document.createElement('pyreon-server-island')
      el.setAttribute('data-name', name)
      document.body.appendChild(el)
      activateServerIslandElement(el)
      await new Promise((r) => setTimeout(r, 0))
      if (valid) {
        expect(urls).toHaveLength(1)
      } else {
        expect(urls).toEqual([])
        // An empty name is simply not a marker; every other refusal is flagged.
        if (name !== '') expect(el.getAttribute('data-island-error')).toBe('fragment-refused')
      }
    })
  }
})
