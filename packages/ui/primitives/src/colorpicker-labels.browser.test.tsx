/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for ColorPickerBase's localizable AT strings + LIVE
 * slider values (2026-07-21 audit, roadmap B3).
 *
 * Pre-fix bugs: the six AT-facing English strings ('Color picker', 'Hue',
 * '{n} degrees', …) had NO override path — the group label even CLOBBERED a
 * consumer-passed `aria-label` (primitive ARIA merged last); and the slider
 * `aria-valuenow`/`aria-valuetext` were EAGER SNAPSHOTS frozen at spread time,
 * so the position a screen reader announced never moved (the ComboboxBase
 * frozen-aria-expanded class).
 *
 * Kept in its own file (conflict-free with in-flight primitive PRs).
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { ColorPickerBase, type ColorPickerState } from './index'

const mountPicker = (extra: Record<string, unknown>, testid: string) =>
  mountInBrowser(
    h(ColorPickerBase as never, {
      defaultValue: '#ff0000',
      ...extra,
      children: (s: ColorPickerState) =>
        h(
          'div',
          s.groupProps(),
          // Pass the props OBJECT (no JS spread — a spread would fire nothing
          // here since values are accessors, but object-pass mirrors the
          // compiled `_applyProps` path; see the #2383 test trap).
          h('div', { ...s.hueSliderProps(), 'data-testid': `${testid}-hue` }),
        ),
    }),
  )

describe('ColorPickerBase — localizable labels (real Chromium)', () => {
  it('labels prop translates the group + slider strings; defaults hold for omitted keys', async () => {
    const { container, unmount } = mountPicker(
      {
        labels: {
          group: 'Farbwähler',
          hue: 'Farbton',
          hueValue: (deg: number) => `${deg} Grad`,
        },
      },
      'de',
    )
    await flush()
    const group = container.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('Farbwähler')
    const hue = container.querySelector('[data-testid="de-hue"]')!
    expect(hue.getAttribute('aria-label')).toBe('Farbton')
    expect(hue.getAttribute('aria-valuetext')).toBe('0 Grad')
    unmount()
  })

  it("a consumer-passed aria-label WINS over the default group label (it isn't clobbered)", async () => {
    const { container, unmount } = mountPicker({ 'aria-label': 'Brand color' }, 'own')
    await flush()
    expect(container.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe(
      'Brand color',
    )
    unmount()
  })

  it('slider aria-valuenow/valuetext are LIVE — a state change moves the announced value', async () => {
    let api: ColorPickerState | null = null
    const { container, unmount } = mountInBrowser(
      h(ColorPickerBase as never, {
        defaultValue: '#ff0000',
        children: (s: ColorPickerState) => {
          api = s
          return h('div', { ...s.hueSliderProps(), 'data-testid': 'live-hue' })
        },
      }),
    )
    await flush()
    const hue = container.querySelector('[data-testid="live-hue"]')!
    expect(hue.getAttribute('aria-valuenow')).toBe('0')

    api!.setHSB(120, 100, 100)
    await flush()
    expect(hue.getAttribute('aria-valuenow'), 'valuenow must track the live hue').toBe('120')
    expect(hue.getAttribute('aria-valuetext')).toBe('120 degrees')
    unmount()
  })
})
