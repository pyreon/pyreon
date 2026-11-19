import { h } from '@pyreon/core'
import { brandTheme, type Theme, theme } from '@pyreon/ui-theme'
import { mount } from '@pyreon/runtime-dom'
import { PyreonUI } from '@pyreon/ui-core'
import { describe, expect, it } from 'vitest'
import { RingProgress } from '../index'
import { recordEmittedStyles, renderStyles } from './resolved-styles'

/**
 * RingProgress takes its colours from the theme and the `<PyreonUI>` mode,
 * asserted on the CSS it emits through the real `h()`.
 *
 * It used to hard-code `#228be6` for the arc (not even the theme's primary)
 * and `#e9ecef` for the track as SVG `stroke` attributes, with no theme
 * access at all, so it ignored both a brand theme and dark mode. Real-Chromium
 * colours and contrast are measured by `ringprogress-mode.browser.test.tsx`.
 */

recordEmittedStyles()

type Mode = 'light' | 'dark'

const THEMES: ReadonlyArray<readonly [string, Theme]> = [
  ['default theme', theme],
  ['brand theme', brandTheme],
]

const TRACK = '& [data-ring-track]'
const ARC = '& [data-ring-arc]'

const ringStyles = (t: Theme, mode: Mode, props: Record<string, unknown> = {}) =>
  renderStyles(h(RingProgress as never, { value: 40, 'data-measure': '', ...props } as never), t, mode)

describe('RingProgress colours', () => {
  for (const [label, t] of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${label}, ${mode} mode: arc is the theme primary, track the mode's muted neutral`, () => {
        const styles = ringStyles(t, mode)
        expect(styles.nested[ARC]?.stroke).toBe(t.color.system.primary.base)
        expect(styles.nested[TRACK]?.stroke).toBe(
          mode === 'light' ? t.color.system.base[100] : t.color.system.light[100],
        )
        // The centre label is text on the page: the mode's text colour.
        expect(styles.base.color).toBe(mode === 'light' ? t.color.system.dark[800] : t.color.system.light[900])
      })
    }
  }

  it('the two themes give different arcs (nothing is hard-coded)', () => {
    expect(theme.color.system.primary.base).not.toBe(brandTheme.color.system.primary.base)
  })
})

describe('RingProgress circles', () => {
  const circles = (props: Record<string, unknown>) => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(h(PyreonUI, { theme, mode: 'light' }, h(RingProgress as never, { value: 40, ...props } as never)), root)
    const [track, arc] = [...root.querySelectorAll('circle')]
    const read = (c: SVGCircleElement | undefined) => ({
      stroke: c?.getAttribute('stroke') ?? null,
      inline: c?.style.stroke ?? null,
    })
    const out = { track: read(track), arc: read(arc) }
    dispose()
    root.remove()

    return out
  }

  it('carry no stroke attribute, so the themed rule paints them', () => {
    const { track, arc } = circles({})
    expect(track.stroke).toBeNull()
    expect(arc.stroke).toBeNull()
    expect(track.inline).toBe('')
    expect(arc.inline).toBe('')
  })

  it('a consumer color / trackColor is an inline style, which beats the themed rule', () => {
    const { track, arc } = circles({ color: 'rgb(1, 2, 3)', trackColor: 'rgb(4, 5, 6)' })
    expect(arc.inline).toBe('rgb(1, 2, 3)')
    expect(track.inline).toBe('rgb(4, 5, 6)')
  })
})
