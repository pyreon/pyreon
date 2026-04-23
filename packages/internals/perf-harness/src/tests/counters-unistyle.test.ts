/**
 * Per-counter behavioural tests for @pyreon/unistyle.
 */
import { styles } from '@pyreon/unistyle'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

// Minimal css tag — we don't need real CSS output, only counter side effects.
const css = (strings: TemplateStringsArray, ...values: unknown[]) => {
  let out = strings[0] ?? ''
  for (let i = 0; i < values.length; i++) {
    out += String(values[i]) + (strings[i + 1] ?? '')
  }
  return out
}

describe('unistyle.styles', () => {
  it('fires once per styles() call', async () => {
    const outcome = await perfHarness.record('styles-3', () => {
      styles({ theme: { paddingX: 10 } as never, css })
      styles({ theme: { marginX: 20 } as never, css })
      styles({ theme: { colorFg: 'red' } as never, css })
    })
    expect(outcome.after['unistyle.styles']).toBe(3)
  })
})

describe('unistyle.descriptor', () => {
  it('fires per-descriptor processed — small for narrow theme, bounded', async () => {
    // Single theme key → only descriptors that consume `paddingX` get
    // processed. Pre-Tier-1 this would have hit ~257; post-fix it's ~1-N.
    const outcome = await perfHarness.record('one-key', () => {
      styles({ theme: { paddingX: 10 } as never, css })
    })
    const count = outcome.after['unistyle.descriptor'] ?? 0
    expect(count).toBeGreaterThan(0)
    // Bound: the Tier-1 lookup means we should touch roughly the number of
    // descriptors consuming paddingX — single digits. Keep the assertion
    // loose so propertyMap changes don't break the test; just confirm the
    // lookup ISN'T doing a full ~257-descriptor scan.
    expect(count).toBeLessThan(30)
  })

  it('falls back to full scan when no theme key matches propertyMap', async () => {
    // `xxx` isn't a theme key in propertyMap — lookup produces zero matches,
    // which tickles the fallback full-scan path.
    const outcome = await perfHarness.record('fallback', () => {
      styles({ theme: { xxx: 1 } as never, css })
    })
    expect(outcome.after['unistyle.descriptor.fallback-scan']).toBe(1)
    // Full scan visits every descriptor — large count expected.
    expect(outcome.after['unistyle.descriptor']).toBeGreaterThan(100)
  })
})
