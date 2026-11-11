import { describe, expect, it } from 'vitest'
import { OVERLAY_CSS, OVERLAY_TOKENS } from '../overlay/view'

/**
 * Every text colour the overlay paints, against the background it is painted
 * on, in both themes: WCAG AA (4.5:1) for text, 3:1 for the focus ring.
 *
 * Backgrounds made with `color-mix(in srgb, …)` are mixed here the same way
 * (per channel, on the gamma-encoded values), so the tinted header, the
 * highlighted code line and the fix box are measured, not assumed.
 */

type Hex = string

function rgb(hex: Hex): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function toHex(c: [number, number, number]): Hex {
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/** `color-mix(in srgb, a p%, b)`. */
function mix(a: Hex, p: number, b: Hex): Hex {
  const x = rgb(a)
  const y = rgb(b)
  return toHex([0, 1, 2].map((i) => x[i]! * p + y[i]! * (1 - p)) as [number, number, number])
}

function luminance(hex: Hex): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: Hex, bg: Hex): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('dev overlay contrast', () => {
  it('the CSS mixes the backgrounds this test measures', () => {
    // If the CSS changes a mix ratio, this test must change with it.
    expect(OVERLAY_CSS).toContain('background:color-mix(in srgb,var(--err) 7%,var(--obs-2))')
    expect(OVERLAY_CSS).toContain('.pz-l.pz-hl{background:color-mix(in srgb,var(--err) 12%,var(--well))}')
    expect(OVERLAY_CSS).toContain('background:color-mix(in srgb,var(--ok) 6%,var(--obs-2))')
  })

  for (const theme of ['dark', 'light'] as const) {
    it(`every text pair reaches 4.5:1 in the ${theme} theme`, () => {
      const t = OVERLAY_TOKENS[theme]
      const head = mix(t.err, 0.07, t.obs2)
      const highlight = mix(t.err, 0.12, t.well)
      const fixBox = mix(t.ok, 0.06, t.obs2)
      const pairs: Array<[string, Hex, Hex]> = [
        ['message on card', t.ivory, t.obs2],
        ['detail label on card', t.fog, t.obs2],
        ['detail value on card', t.ivory, t.obs2],
        ['file link on card', t.link, t.obs2],
        ['secondary button on card', t.ivory, t.obs2],
        ['stack user frame on card', t.ivory, t.obs2],
        ['stack location on card', t.mist, t.obs2],
        ['stack library frame on card', t.fog, t.obs2],
        ['status on card', t.mist, t.obs2],
        ['reopen button', t.err, t.obs2],
        ['chip on header', t.err, head],
        ['route on header', t.mist, head],
        ['dismiss hint on header', t.fog, head],
        ['kbd', t.mist, t.obs3],
        ['line number in code', t.fog, t.well],
        ['code', t.code, t.well],
        ['caret', t.err, t.well],
        ['highlighted line number', t.err, highlight],
        ['highlighted code', t.code, highlight],
        ['fix heading', t.ok, fixBox],
        ['fix cause', t.mist, fixBox],
        ['fix action', t.ivory, fixBox],
        ['fix code', t.code, t.well],
        ['primary button', t.obs, t.ivory],
      ]
      const failing = pairs
        .map(([name, fg, bg]) => ({ name, ratio: contrast(fg, bg) }))
        .filter((p) => p.ratio < 4.5)
        .map((p) => `${p.name}: ${p.ratio.toFixed(2)}:1`)
      expect(failing).toEqual([])
    })

    it(`the focus ring reaches 3:1 against the card and the page in the ${theme} theme`, () => {
      const t = OVERLAY_TOKENS[theme]
      expect(contrast(t.link, t.obs2)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.link, t.obs)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.link, t.well)).toBeGreaterThanOrEqual(3)
    })
  }

  it('measures a known pair correctly (black on white is 21:1)', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })
})
