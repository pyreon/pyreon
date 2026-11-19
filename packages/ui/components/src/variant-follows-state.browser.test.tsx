import { h, type VNodeChild } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { brandTheme, type Theme, theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import { ActionIcon, Alert, Button, Input, Textarea } from './index'

/**
 * A variant draws in the tone of the active STATE, measured in real Chromium.
 *
 * `variant` and `state` are independent rocketstyle dimensions, and a variant
 * slice cannot see which state is active. The variants used to hard-code one
 * tone, so `<Button state="danger" variant="outline">` drew a blue outline,
 * `<Alert state="error" variant="solid">` an info-blue fill, and
 * `<Input state="error" variant="filled">` no error border at all. The state
 * now sets tone keys that the variant (a transform dimension) reads, so there
 * is one definition per variant and its hue follows the state.
 *
 * Expected colours are theme tokens, normalised through the browser's own
 * colour parser so `#991b1b` and `rgb(153, 27, 27)` compare equal.
 *
 * The file also runs in the package's happy-dom suite, which has no CSS
 * engine; there it is skipped.
 */
const IS_BROWSER_RUNNER = (globalThis as Record<string, unknown>).__vitest_browser__ === true

type Mode = 'light' | 'dark'
type FillTone = 'primary' | 'success' | 'info' | 'error' | 'warning'
type Expect = Partial<Record<'color' | 'backgroundColor' | 'borderTopColor' | 'borderBottomColor', string>>

const any = (c: unknown) => c as never

/** A CSS colour as the browser computes it. */
const cssColor = (value: string) => {
  const probe = document.createElement('span')
  probe.style.color = value
  document.body.appendChild(probe)
  const out = getComputedStyle(probe).color
  probe.remove()

  return out
}

const text = (t: Theme, mode: Mode, tone: FillTone) =>
  mode === 'light' ? t.color.system[tone].text : t.color.system[tone].textDark

interface Case {
  name: string
  render: () => VNodeChild
  expect: (t: Theme, mode: Mode) => Expect
}

const M = { 'data-measure': '' }

const BUTTON_STATES = [
  ['primary', 'primary'],
  ['danger', 'error'],
  ['success', 'success'],
] as const

const buttonCases = (component: unknown, label: string, states: ReadonlyArray<readonly [string, FillTone]>, subtleTint: '50' | '100') =>
  states.flatMap(([state, tone]): Case[] => [
    {
      name: `${label} state=${state} variant=outline`,
      render: () => h(any(component), { ...M, state, variant: 'outline' }, 'Go'),
      expect: (t, mode) => ({ borderTopColor: t.color.system[tone].base, color: text(t, mode, tone) }),
    },
    {
      name: `${label} state=${state} variant=outline (hover)`,
      render: () => h(any(component), { ...M, state, variant: 'outline', hover: true }, 'Go'),
      expect: (t) => ({ backgroundColor: t.color.system[tone][50] }),
    },
    {
      name: `${label} state=${state} variant=subtle`,
      render: () => h(any(component), { ...M, state, variant: 'subtle' }, 'Go'),
      expect: (t, mode) => ({ backgroundColor: t.color.system[tone][subtleTint], color: text(t, mode, tone) }),
    },
  ])

const CASES: Case[] = [
  ...buttonCases(Button, 'Button', BUTTON_STATES, '100'),
  ...BUTTON_STATES.flatMap(([state, tone]) =>
    (['ghost', 'link'] as const).map(
      (variant): Case => ({
        name: `Button state=${state} variant=${variant}`,
        render: () => h(any(Button), { ...M, state, variant }, 'Go'),
        expect: (t, mode) => ({ color: text(t, mode, tone) }),
      }),
    ),
  ),
  {
    name: 'Button variant=outline without a state is primary',
    render: () => h(any(Button), { ...M, variant: 'outline' }, 'Go'),
    expect: (t, mode) => ({ borderTopColor: t.color.system.primary.base, color: text(t, mode, 'primary') }),
  },
  ...buttonCases(
    ActionIcon,
    'ActionIcon',
    [
      ['primary', 'primary'],
      ['danger', 'error'],
    ],
    '50',
  ),
  ...(['info', 'success', 'warning', 'error'] as const).map(
    (state): Case => ({
      name: `Alert state=${state} variant=solid`,
      render: () => h(any(Alert), { ...M, state, variant: 'solid' }, 'Heads up'),
      expect: (t) => ({ backgroundColor: t.color.system[state].base, color: t.color.system[state].contrast }),
    }),
  ),
  ...[Input, Textarea].flatMap((component, i) => {
    const label = i === 0 ? 'Input' : 'Textarea'
    return (['error', 'success'] as const).flatMap((state): Case[] => [
      {
        name: `${label} state=${state} (focus)`,
        render: () => h(any(component), { ...M, state, focus: true }),
        expect: (t) => ({ borderTopColor: t.color.system[state].base }),
      },
      {
        name: `${label} state=${state} variant=filled`,
        render: () => h(any(component), { ...M, state, variant: 'filled' }),
        expect: (t) => ({ borderTopColor: t.color.system[state].base }),
      },
      {
        name: `${label} state=${state} variant=filled (focus)`,
        render: () => h(any(component), { ...M, state, variant: 'filled', focus: true }),
        expect: (t) => ({ borderTopColor: t.color.system[state].base }),
      },
      {
        name: `${label} state=${state} variant=underline`,
        render: () => h(any(component), { ...M, state, variant: 'underline' }),
        expect: (t) => ({ borderBottomColor: t.color.system[state].base }),
      },
      {
        name: `${label} state=${state} variant=underline (focus)`,
        render: () => h(any(component), { ...M, state, variant: 'underline', focus: true }),
        expect: (t) => ({ borderBottomColor: t.color.system[state].base }),
      },
    ])
  }),
  {
    name: 'Input variant=filled without a state has no border',
    render: () => h(any(Input), { ...M, variant: 'filled' }),
    expect: () => ({ borderTopColor: 'rgba(0, 0, 0, 0)' }),
  },
  {
    name: 'Input variant=filled without a state focuses primary',
    render: () => h(any(Input), { ...M, variant: 'filled', focus: true }),
    expect: (t) => ({ borderTopColor: t.color.system.primary.base }),
  },
]

const THEMES: ReadonlyArray<readonly [string, Theme]> = [
  ['default theme', theme],
  ['brand theme', brandTheme],
]

describe.runIf(IS_BROWSER_RUNNER)('a variant draws in the active state’s tone (real Chromium)', () => {
  for (const [label, t] of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      describe(`${label}, ${mode} mode`, () => {
        for (const c of CASES) {
          it(c.name, () => {
            const { container, unmount } = mountInBrowser(h(PyreonUI, { theme: t, mode }, c.render()))
            const el = container.querySelector('[data-measure]')
            expect(el, `${c.name} rendered no [data-measure] element`).not.toBeNull()
            const cs = getComputedStyle(el!)
            for (const [prop, token] of Object.entries(c.expect(t, mode))) {
              expect(cs[prop as keyof Expect], `${c.name}: ${prop}`).toBe(cssColor(token))
            }
            unmount()
          })
        }
      })
    }
  }
})
