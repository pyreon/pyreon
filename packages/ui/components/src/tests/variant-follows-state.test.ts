import { h, type VNodeChild } from '@pyreon/core'
import { brandTheme, type Theme, theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import { ActionIcon, Alert, Button, Input, Textarea } from '../index'
import { borderEdgeColor, recordEmittedStyles, renderStyles } from './resolved-styles'

/**
 * A variant draws in the tone of the active STATE (#4425), asserted on the CSS
 * each component emits, through the real `h()` under `<PyreonUI theme mode>`.
 *
 * `variant-follows-state.browser.test.tsx` measures the same pairs as computed
 * colours in real Chromium; this file is its node counterpart, so the
 * state × variant logic is also locked where the package's coverage is
 * measured. Each expectation names the theme token the state should resolve
 * to, and the danger / error cases also assert it is NOT the primary token —
 * the colour every variant drew before the fix.
 */

recordEmittedStyles()

type Mode = 'light' | 'dark'
type FillTone = 'primary' | 'success' | 'info' | 'error' | 'warning'

const THEMES: ReadonlyArray<readonly [string, Theme]> = [
  ['default theme', theme],
  ['brand theme', brandTheme],
]

const MODES: readonly Mode[] = ['light', 'dark']

const M = { 'data-measure': '' }

/** Renders a component with loosely-typed props (the dimension props are generic per component). */
const render = (component: unknown, props: Record<string, unknown>, t: Theme, mode: Mode, children?: VNodeChild) =>
  renderStyles(h(component as never, { ...M, ...props }, children), t, mode)

/** The tone's text colour for the mode: `text` on a light page, `textDark` on a dark one. */
const toneText = (t: Theme, mode: Mode, tone: FillTone) =>
  mode === 'light' ? t.color.system[tone].text : t.color.system[tone].textDark

const BUTTON_STATES = [
  ['primary', 'primary'],
  ['danger', 'error'],
  ['success', 'success'],
] as const

for (const [themeLabel, t] of THEMES) {
  for (const mode of MODES) {
    describe(`${themeLabel}, ${mode} mode`, () => {
      describe('Button', () => {
        for (const [state, tone] of BUTTON_STATES) {
          it(`state=${state} variant=outline: border, text and hover tint in the ${tone} tone`, () => {
            const s = render(Button, { state, variant: 'outline' }, t, mode, 'Go')
            expect(s.base['border-color']).toBe(t.color.system[tone].base)
            expect(s.base.color).toBe(toneText(t, mode, tone))
            expect(s.base['background-color']).toBe(t.color.system.transparent)
            expect(s.nested['&:hover']?.['background-color']).toBe(t.color.system[tone][50])
          })

          it(`state=${state} variant=subtle: the ${tone} [100] tint, [200] on hover`, () => {
            const s = render(Button, { state, variant: 'subtle' }, t, mode, 'Go')
            expect(s.base['background-color']).toBe(t.color.system[tone][100])
            expect(s.base.color).toBe(toneText(t, mode, tone))
            expect(s.nested['&:hover']?.['background-color']).toBe(t.color.system[tone][200])
          })

          for (const variant of ['ghost', 'link'] as const) {
            it(`state=${state} variant=${variant}: text in the ${tone} tone`, () => {
              const s = render(Button, { state, variant }, t, mode, 'Go')
              expect(s.base.color).toBe(toneText(t, mode, tone))
              expect(s.base['background-color']).toBe(t.color.system.transparent)
            })
          }
        }

        it('state=danger variant=outline is not drawn in primary', () => {
          const s = render(Button, { state: 'danger', variant: 'outline' }, t, mode, 'Go')
          expect(s.base['border-color']).not.toBe(t.color.system.primary.base)
          expect(s.base.color).not.toBe(toneText(t, mode, 'primary'))
        })

        it('variant=outline without a state draws in primary (the base tone)', () => {
          const s = render(Button, { variant: 'outline' }, t, mode, 'Go')
          expect(s.base['border-color']).toBe(t.color.system.primary.base)
          expect(s.base.color).toBe(toneText(t, mode, 'primary'))
        })

        it('state=secondary variant=outline draws in the neutral tone: the control border and primary text', () => {
          const s = render(Button, { state: 'secondary', variant: 'outline' }, t, mode, 'Go')
          expect(s.base['border-color']).toBe(mode === 'light' ? t.color.system.dark[500] : t.color.system.light[400])
          expect(s.base.color).toBe(mode === 'light' ? t.color.system.dark[800] : t.color.system.light[900])
          expect(s.nested['&:hover']?.['background-color']).toBe(t.color.system.base[50])
        })

        it('variant=solid keeps the state fill (the plain-object variant still merges)', () => {
          const s = render(Button, { state: 'danger', variant: 'solid' }, t, mode, 'Go')
          expect(s.base['background-color']).toBe(t.color.system.error.base)
          expect(s.base.color).toBe(t.color.system.error.contrast)
        })
      })

      describe('ActionIcon', () => {
        for (const [state, tone] of [
          ['primary', 'primary'],
          ['danger', 'error'],
        ] as const) {
          it(`state=${state} variant=outline: border and text in the ${tone} tone`, () => {
            const s = render(ActionIcon, { state, variant: 'outline' }, t, mode)
            expect(s.base['border-color']).toBe(t.color.system[tone].base)
            expect(s.base.color).toBe(toneText(t, mode, tone))
            expect(s.nested['&:hover']?.['background-color']).toBe(t.color.system[tone][50])
          })

          it(`state=${state} variant=subtle: the ${tone} [50] tint, [100] on hover`, () => {
            const s = render(ActionIcon, { state, variant: 'subtle' }, t, mode)
            expect(s.base['background-color']).toBe(t.color.system[tone][50])
            expect(s.base.color).toBe(toneText(t, mode, tone))
            expect(s.nested['&:hover']?.['background-color']).toBe(t.color.system[tone][100])
          })
        }

        it('state=secondary variant=subtle draws on the neutral tint', () => {
          const s = render(ActionIcon, { state: 'secondary', variant: 'subtle' }, t, mode)
          expect(s.base['background-color']).toBe(t.color.system.base[50])
          expect(s.nested['&:hover']?.['background-color']).toBe(t.color.system.base[100])
        })
      })

      describe('Alert', () => {
        for (const state of ['info', 'success', 'warning', 'error'] as const) {
          it(`state=${state} variant=solid fills with the ${state} tone and its contrast text`, () => {
            const s = render(Alert, { state, variant: 'solid' }, t, mode, 'Heads up')
            expect(s.base['background-color']).toBe(t.color.system[state].base)
            expect(s.base.color).toBe(t.color.system[state].contrast)
          })
        }

        it('state=error variant=solid is not the info fill it used to be', () => {
          const s = render(Alert, { state: 'error', variant: 'solid' }, t, mode, 'Heads up')
          expect(s.base['background-color']).not.toBe(t.color.system.info.base)
        })

        it('variant=solid without a state is an info fill (the base tone)', () => {
          const s = render(Alert, { variant: 'solid' }, t, mode, 'Heads up')
          expect(s.base['background-color']).toBe(t.color.system.info.base)
          expect(s.base.color).toBe(t.color.system.info.contrast)
        })
      })

      for (const [label, component] of [
        ['Input', Input],
        ['Textarea', Textarea],
      ] as const) {
        describe(label, () => {
          for (const state of ['error', 'success'] as const) {
            const status = t.color.system[state].base

            it(`state=${state}: the status border, kept on focus`, () => {
              const s = render(component, { state }, t, mode)
              expect(s.base['border-color']).toBe(status)
              expect(s.nested['&:focus-visible']?.['border-color']).toBe(status)
            })

            it(`state=${state} variant=filled keeps the status border, focused or not`, () => {
              const s = render(component, { state, variant: 'filled' }, t, mode)
              expect(s.base['border-color']).toBe(status)
              expect(s.base['background-color']).toBe(t.color.system.base[100])
              expect(s.nested['&:focus-visible']?.['border-color']).toBe(status)
              expect(s.nested['&:focus-visible']?.['border-color']).not.toBe(t.color.system.primary.base)
            })

            it(`state=${state} variant=filled with focus forced: the status border, not primary`, () => {
              const s = render(component, { state, variant: 'filled', focus: true }, t, mode)
              expect(s.base['border-color']).toBe(status)
            })

            it(`state=${state} variant=underline: the status bottom border, focused or not`, () => {
              const s = render(component, { state, variant: 'underline' }, t, mode)
              expect(borderEdgeColor(s.base, 'bottom')).toBe(status)
              expect(borderEdgeColor(s.nested['&:focus-visible'], 'bottom')).toBe(status)
            })
          }

          it('variant=filled without a state: no border at rest, the surface and primary on focus', () => {
            const s = render(component, { variant: 'filled' }, t, mode)
            expect(s.base['border-color']).toBe(t.color.system.transparent)
            expect(s.nested['&:focus-visible']?.['border-color']).toBe(t.color.system.primary.base)
            expect(s.nested['&:focus-visible']?.['background-color']).toBe(
              mode === 'light' ? t.color.system.light.base : 'rgba(30, 41, 59, 1)',
            )
          })

          it('variant=underline without a state: the control border, primary on focus', () => {
            const s = render(component, { variant: 'underline' }, t, mode)
            expect(borderEdgeColor(s.base, 'bottom')).toBe(mode === 'light' ? t.color.system.dark[500] : t.color.system.light[400])
            expect(borderEdgeColor(s.nested['&:focus-visible'], 'bottom')).toBe(t.color.system.primary.base)
          })
        })
      }
    })
  }
}
