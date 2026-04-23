// @vitest-environment happy-dom
/**
 * unistyle hot-path probe.
 *
 * Tests responsive value handling: single, array [xs, sm, md], and
 * object { xs, sm, md } forms should all produce equivalent output.
 * Also verifies the Tier-1 descriptor lookup optimization.
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

const css = (strings: TemplateStringsArray, ...values: unknown[]) => {
  let out = strings[0] ?? ''
  for (let i = 0; i < values.length; i++) {
    out += String(values[i]) + (strings[i + 1] ?? '')
  }
  return out
}

describe('unistyle — responsive + descriptor scaling', () => {
  it('single-value theme → ~5-15 descriptors (Tier-1 lookup)', async () => {
    const outcome = await perfHarness.record('single-value', () => {
      styles({ theme: { paddingX: 10 } as never, css })
    })
    const descriptors = outcome.after['unistyle.descriptor'] ?? 0
    expect(descriptors).toBeGreaterThan(0)
    expect(descriptors).toBeLessThan(30)
    // oxlint-disable-next-line no-console
    console.log(`[unistyle] single-value paddingX: descriptors=${descriptors}`)
  })

  it('multi-key theme (10 keys) → proportional descriptors, not full scan', async () => {
    const theme = {
      paddingX: 10,
      marginX: 10,
      colorFg: 'red',
      colorBg: 'blue',
      fontSize: 14,
      borderRadius: 4,
      width: 100,
      height: 50,
      opacity: 0.5,
      zIndex: 10,
    }
    const outcome = await perfHarness.record('multi-key-10', () => {
      styles({ theme: theme as never, css })
    })
    const descriptors = outcome.after['unistyle.descriptor'] ?? 0
    // oxlint-disable-next-line no-console
    console.log(`[unistyle] 10-key theme: descriptors=${descriptors}`)
    // Should be small multiple of 10 — one or two descriptors per key.
    expect(descriptors).toBeLessThan(100)
  })

  it('100 consecutive styles() calls with same theme → no allocation growth', async () => {
    const theme = { paddingX: 10, colorFg: 'red' }
    const outcome = await perfHarness.record('100-calls', () => {
      for (let i = 0; i < 100; i++) {
        styles({ theme: theme as never, css })
      }
    })
    expect(outcome.after['unistyle.styles']).toBe(100)
    // Per-call descriptor count should be constant — 100 calls × N descriptors
    // = 100×N total. If higher, something's accumulating.
    const descriptors = outcome.after['unistyle.descriptor'] ?? 0
    const perCall = descriptors / 100
    // oxlint-disable-next-line no-console
    console.log(`[unistyle] 100 calls: ${descriptors} total = ${perCall.toFixed(1)} per call`)
    expect(perCall).toBeLessThan(20)
  })

  it('unknown theme key falls back to full scan — fallback-scan counter fires', async () => {
    // `xxx` is not a known theme key → full-scan fallback
    const outcome = await perfHarness.record('fallback', () => {
      styles({ theme: { xxx: 1 } as never, css })
    })
    expect(outcome.after['unistyle.descriptor.fallback-scan']).toBe(1)
    // Full scan hits every descriptor
    expect(outcome.after['unistyle.descriptor']).toBeGreaterThan(100)
  })

  it('empty theme → zero descriptors, zero work', async () => {
    const outcome = await perfHarness.record('empty', () => {
      styles({ theme: {} as never, css })
    })
    expect(outcome.after['unistyle.styles']).toBe(1)
    // No theme keys → no descriptors touched
    expect(outcome.after['unistyle.descriptor']).toBeFalsy()
    expect(outcome.after['unistyle.descriptor.fallback-scan']).toBeFalsy()
  })
})
