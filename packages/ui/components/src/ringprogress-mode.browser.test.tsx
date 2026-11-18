import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { init, PyreonUI } from '@pyreon/ui-core'
import { type Theme, brandTheme, theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import RingProgress from './components/RingProgress'
import { checkModeContrast, contrast, MODES, type Mode, realCss, unmountModeContrast } from './tests/mode-contrast'

/**
 * RingProgress paints with the theme and follows `<PyreonUI mode>`, measured
 * in real Chromium. It used to draw `#228be6` / `#e9ecef` as `stroke`
 * attributes whatever the theme or mode: a brand theme's ring stayed Mantine
 * blue, and in dark mode the pale track glared off the slate page.
 *
 * The colours reach the SVG `stroke` through CSS, so this reads the COMPUTED
 * stroke (a `stroke` attribute would lose to it, an inline style would win).
 */

type RGBA = [number, number, number, number]

const PAGE: Record<Mode, string> = { light: 'rgb(255, 255, 255)', dark: theme.color.system.dark.base }

const rgba = (c: string): RGBA => {
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) throw new Error(`unparsed colour ${c}`)
  const p = m[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number)

  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]
}

const over = (top: RGBA, bottom: RGBA): RGBA => {
  const a = top[3] + bottom[3] * (1 - top[3])
  const ch = (i: number) => (top[i]! * top[3] + bottom[i]! * bottom[3] * (1 - top[3])) / a

  return [ch(0), ch(1), ch(2), a]
}

/** Any CSS colour as Chromium computes it, for comparing a theme value to a computed stroke. */
const computed = (color: string): string => {
  const probe = document.createElement('i')
  probe.style.color = color
  document.body.appendChild(probe)
  const out = getComputedStyle(probe).color
  probe.remove()

  return out
}

let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  unmountModeContrast()
})

const mountRing = (t: Theme, mode: Mode | (() => Mode), props: Record<string, unknown> = {}) => {
  const page = typeof mode === 'function' ? () => PAGE[mode()] : PAGE[mode]
  const { container, unmount } = mountInBrowser(
    h(
      PyreonUI as never,
      { theme: t, mode },
      h(
        'div',
        { style: () => `background:${typeof page === 'function' ? page() : page};padding:8px` },
        h(RingProgress as never, { value: 40, ...props }, '40%'),
      ),
    ),
  )
  cleanup = unmount
  const [track, arc] = [...container.querySelectorAll('circle')] as [SVGCircleElement, SVGCircleElement]
  const root = container.querySelector('[role="progressbar"]')!

  return { track, arc, root, stroke: (c: SVGCircleElement) => getComputedStyle(c).stroke }
}

const THEMES: ReadonlyArray<readonly [string, Theme]> = [
  ['default theme', theme],
  ['brand theme', brandTheme],
]

describe.skipIf(!realCss)('RingProgress colours (real Chromium)', () => {
  for (const [label, t] of THEMES) {
    for (const mode of MODES) {
      it(`${label}, ${mode} mode: arc = theme primary, track = the mode's neutral, both legible`, () => {
        const { track, arc, stroke } = mountRing(t, mode)
        expect(stroke(arc)).toBe(computed(t.color.system.primary.base))
        const trackTone = mode === 'light' ? t.color.system.base[100] : t.color.system.light[100]
        expect(stroke(track)).toBe(computed(trackTone))

        const page = rgba(PAGE[mode])
        const arcInk = over(rgba(stroke(arc)), page)
        const trackInk = over(rgba(stroke(track)), page)
        // WCAG 1.4.11: the arc is the information and must stand off the page.
        // (Arc vs track is not held to 3:1: the brand primary is 3.06:1 on
        // white, so ANY visible track takes it below that — 2.82:1 here.)
        expect(contrast(arcInk, page), 'arc vs page').toBeGreaterThanOrEqual(3)
        // The track is a quiet groove on the page: visible, never louder than the arc.
        expect(contrast(trackInk, page), 'track vs page').toBeGreaterThan(1.05)
        expect(contrast(trackInk, page), 'track quieter than arc').toBeLessThan(contrast(arcInk, page))
      })
    }
  }

  it('a consumer color / trackColor still wins over the theme', () => {
    const { track, arc, stroke } = mountRing(theme, 'dark', { color: 'rgb(200, 10, 10)', trackColor: 'rgb(10, 200, 10)' })
    expect(stroke(arc)).toBe('rgb(200, 10, 10)')
    expect(stroke(track)).toBe('rgb(10, 200, 10)')
  })
})

describe.skipIf(!realCss).each(MODES)('RingProgress label in %s mode', (mode) => {
  it('centre label is legible on the page', () => {
    checkModeContrast(mode, {
      name: 'RingProgress label',
      render: () => h(RingProgress as never, { value: 40 }, '40%'),
      text: (r) => r.querySelector('[role="progressbar"] > div'),
    })
  })
})

describe.skipIf(!realCss)('RingProgress under init({ cssVariables: true })', () => {
  it('paints the same colours and follows a mode flip without a re-render', () => {
    init({ cssVariables: true })
    try {
      const mode = signal<Mode>('light')
      const { track, arc, root, stroke } = mountRing(theme, () => mode())
      expect(stroke(arc)).toBe(computed(theme.color.system.primary.base))
      expect(stroke(track)).toBe(computed(theme.color.system.base[100]))
      const classBefore = root.className

      mode.set('dark')
      expect(stroke(arc)).toBe(computed(theme.color.system.primary.base))
      expect(stroke(track)).toBe(computed(theme.color.system.light[100]))
      expect(root.className, 'var mode: no class churn').toBe(classBefore)
    } finally {
      init({ cssVariables: false })
    }
  })
})
