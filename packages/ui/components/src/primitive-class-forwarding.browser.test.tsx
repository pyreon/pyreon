import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { Calendar, ColorPicker, Combobox, FileUpload, MultiSelect } from './index'

/**
 * Regression guard for a whole bug class: the headless RENDER-FN primitives
 * (ComboboxBase / CalendarBase / ColorPickerBase / FileUploadBase / TreeBase)
 * render no element of their own — they return `children(state)` — and used to
 * DROP their `rest` props. Since rocketstyle styles "the component's element",
 * `.config({ component: XBase }) + .theme()` computed a class that reached
 * NOTHING: Combobox, MultiSelect, Autocomplete, Calendar, ColorPicker and
 * FileUpload all rendered COMPLETELY UNSTYLED, with hundreds of lines of dead
 * theme. (The element-rendering primitives — Select/Switch/Checkbox/Slider/
 * Radio/Tabs/Modal — forward `rest` and were always fine.)
 *
 * Each primitive now forwards `rest` (via descriptor-safe `mergeProps`, never a
 * spread — a spread would freeze getter-shaped reactive props) into the getter
 * its component's `.theme()` semantically describes.
 *
 * The lesson these lock in: "delegates to a primitive" is NOT the same as
 * "works". The primitive-first gate proves delegation; only these prove the
 * styling actually lands — which is exactly how this shipped unnoticed.
 */

type WithGetter<K extends string> = Record<K, () => Record<string, unknown>>

describe('render-fn primitives forward the rocketstyle class to the themed element', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  /** Combobox's .theme() is input-shaped (width/border/radius/focus ring) → inputProps. */
  it('Combobox applies its theme class to the INPUT', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Combobox as never, {
          options: [{ value: 'a', label: 'A' }],
          children: (s: WithGetter<'inputProps'>) => h('div', null, h('input', s.inputProps())),
        }),
      ),
    )
    cleanup = unmount
    const input = container.querySelector('input') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.getAttribute('data-rocketstyle')).toBe('Combobox')
    expect(input.className).toBeTruthy()
    // the primitive's own ARIA must still win over forwarded props
    expect(input.getAttribute('role')).toBe('combobox')
  })

  it('MultiSelect applies its theme class to the INPUT', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(MultiSelect as never, {
          options: [{ value: 'a', label: 'A' }],
          children: (s: WithGetter<'inputProps'>) => h('div', null, h('input', s.inputProps())),
        }),
      ),
    )
    cleanup = unmount
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('data-rocketstyle')).toBe('MultiSelect')
    expect(input.className).toBeTruthy()
  })

  /** ColorPicker's .theme() is a container card (bg/radius/padding/shadow) → groupProps. */
  it('ColorPicker applies its theme class to the GROUP container', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(ColorPicker as never, {
          children: (s: WithGetter<'groupProps'>) => h('div', s.groupProps()),
        }),
      ),
    )
    cleanup = unmount
    const group = container.querySelector('[role="group"]') as HTMLElement
    expect(group).toBeTruthy()
    expect(group.getAttribute('data-rocketstyle')).toBe('ColorPicker')
    expect(group.className).toBeTruthy()
  })

  /**
   * FileUpload's .theme() is the dashed dropzone (border/padding/bg) → dropZoneProps.
   * NOTE: dropZoneProps is a plain OBJECT, not a getter — both existing consumers
   * spread it without call parens, so it must stay that arity.
   */
  it('FileUpload applies its theme class to the DROPZONE', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(FileUpload as never, {
          children: (s: { dropZoneProps: Record<string, unknown> }) => h('div', s.dropZoneProps),
        }),
      ),
    )
    cleanup = unmount
    const zone = container.querySelector('[data-rocketstyle="FileUpload"]') as HTMLElement
    expect(zone).toBeTruthy()
    expect(zone.className).toBeTruthy()
  })

  /**
   * Calendar's .theme() is a CARD wrapping header + grid, so `gridProps` would be
   * the wrong target (the header would fall outside the card). CalendarBase gained
   * a dedicated `rootProps()` for the container instead.
   */
  it('Calendar applies its theme class to the ROOT container (not the grid)', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Calendar as never, {
          children: (s: WithGetter<'rootProps'> & WithGetter<'gridProps'>) =>
            h('div', s.rootProps(), h('div', s.gridProps())),
        }),
      ),
    )
    cleanup = unmount
    const root = container.querySelector('[data-rocketstyle="Calendar"]') as HTMLElement
    expect(root).toBeTruthy()
    expect(root.className).toBeTruthy()
    // the card styling belongs on the container, NOT on the role=grid element
    expect(root.getAttribute('role')).not.toBe('grid')
  })
})
