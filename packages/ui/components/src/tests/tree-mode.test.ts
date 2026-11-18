import { h } from '@pyreon/core'
import { brandTheme, type Theme, theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import { TreeItem } from '../index'
import { recordEmittedStyles, renderStyles } from './resolved-styles'

/**
 * A selected TreeItem follows the `<PyreonUI>` mode (#4340), asserted on the
 * CSS it emits through the real `h()` under `<PyreonUI theme mode>`.
 *
 * The selected look is static CSS keyed on `aria-selected` (so the row never
 * re-renders and keeps its roving focus). It used to be an `extendCss` string
 * with the light-only `primary.text`, illegible on the dark page; it now reads
 * theme keys resolved for the mode. Real-Chromium contrast is measured by
 * `actions-mode-contrast.browser.test.tsx`.
 */

recordEmittedStyles()

type Mode = 'light' | 'dark'

const THEMES: ReadonlyArray<readonly [string, Theme]> = [
  ['default theme', theme],
  ['brand theme', brandTheme],
]

const SELECTED = "&[aria-selected='true']"

const selectedBlock = (component: unknown, t: Theme, mode: Mode) =>
  renderStyles(h(component as never, { 'data-measure': '' } as never, 'Docs'), t, mode).nested[SELECTED]

describe('TreeItem selected look', () => {
  for (const [label, t] of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${label}, ${mode} mode: the primary tint behind the mode's primary text`, () => {
        const block = selectedBlock(TreeItem, t, mode)
        expect(block?.['background-color']).toBe(t.color.system.primary[50])
        expect(block?.color).toBe(mode === 'light' ? t.color.system.primary.text : t.color.system.primary.textDark)
      })
    }
  }

  it('a selected-look key a consumer sets to a non-string emits no colour, not "[object Object]"', () => {
    const Custom = (TreeItem as unknown as { theme: (cb: () => Record<string, unknown>) => unknown }).theme(() => ({
      selectedColor: { light: 'red' },
    }))
    const block = selectedBlock(Custom, theme, 'light')
    expect(block?.color).toBeUndefined()
    expect(block?.['background-color']).toBe(theme.color.system.primary[50])
  })
})
