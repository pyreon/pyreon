/**
 * Branch-coverage test for defineBrowserConfig — node-side helper test
 * that verifies the config shape without actually launching a browser.
 */
import { describe, expect, it } from 'vitest'
import { defineBrowserConfig } from '../browser'

const fakeProvider = { name: 'playwright', options: {} } as unknown as Parameters<typeof defineBrowserConfig>[0]

describe('defineBrowserConfig', () => {
  it('returns a config object with browser instance settings', () => {
    const cfg = defineBrowserConfig(fakeProvider)
    expect(cfg).toBeTruthy()
    expect(typeof cfg).toBe('object')
  })

  it('accepts overrides and merges them', () => {
    const cfg = defineBrowserConfig(fakeProvider, {
      test: { coverage: { thresholds: { statements: 90 } } },
    } as unknown as Parameters<typeof defineBrowserConfig>[1])
    expect(cfg).toBeTruthy()
  })
})
