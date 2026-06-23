import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import {
  CalendarBase,
  type CalendarState,
  CheckboxBase,
  ColorPickerBase,
  type ColorPickerState,
  ComboboxBase,
  type ComboboxState,
  ModalBase,
  RadioBase,
  RadioGroupBase,
  SliderBase,
  SwitchBase,
  TabBase,
  TabPanelBase,
  TabsBase,
  TreeBase,
  type TreeState,
} from './index'

/**
 * Real-browser smoke test for `@pyreon/ui-primitives`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. This catches regressions that happy-dom tests
 * can hide: importing a representative headless primitive and mounting
 * it through the JSX runtime + `useControllableState` hook chain in a
 * real Chromium browser (the toggle interaction itself is covered by
 * unit tests in `src/__tests__/`).
 *
 * ## Why these assert ARIA roles/state in a REAL browser
 *
 * These are HEADLESS primitives: their accessibility comes from `role` +
 * `aria-*` wiring on the rendered elements (the ARIA-helper-props pattern),
 * which a static linter CANNOT verify — `oxlint`'s `jsx-a11y` interactivity/
 * role rules are scoped off here precisely because they false-positive on the
 * `role`-on-a-custom-element headless idiom. So the real a11y gate for these
 * primitives is THIS test: mount the primitive and assert the rendered
 * `role` + `aria-*` actually land in the DOM. Covers the JSX-rendering
 * primitives (Switch / Checkbox / RadioGroup / Tabs / Modal / Slider) AND
 * the render-prop primitives (Tree / Combobox), where the a11y contract is
 * the helper-object → spread → DOM-role chain. Extend as new primitives ship.
 */
describe('@pyreon/ui-primitives — browser smoke', () => {
  it('mounts SwitchBase with role=switch and ARIA wiring intact', () => {
    const { container, unmount } = mountInBrowser(
      h(SwitchBase as never, {
        defaultChecked: true,
        id: 'smoke-switch',
        children: 'toggle me',
      }),
    )
    const sw = query<HTMLButtonElement>(container, '#smoke-switch')
    expect(sw).not.toBeNull()
    expect(sw.tagName).toBe('BUTTON')
    expect(sw.getAttribute('role')).toBe('switch')
    // `defaultChecked: true` → aria-checked="true" (the STRING value — not
    // presence-only "", which assistive tech does NOT read as checked). The
    // toggle interaction is covered by unit tests, not this smoke.
    expect(sw.getAttribute('aria-checked')).toBe('true')

    unmount()
    expect(document.getElementById('smoke-switch')).toBeNull()
  })

  it('mounts CheckboxBase with role=checkbox + aria-checked wiring intact', () => {
    const { container, unmount } = mountInBrowser(
      h(CheckboxBase as never, {
        defaultChecked: true,
        id: 'smoke-cb',
        children: 'check me',
      }),
    )
    const cb = query<HTMLElement>(container, '#smoke-cb')
    expect(cb).not.toBeNull()
    expect(cb.getAttribute('role')).toBe('checkbox')
    expect(cb.getAttribute('aria-checked')).toBe('true')

    unmount()
    expect(document.getElementById('smoke-cb')).toBeNull()
  })

  it('mounts RadioGroupBase with role=radiogroup + role=radio items; the selected radio is aria-checked', () => {
    const { container, unmount } = mountInBrowser(
      h(
        RadioGroupBase as never,
        { defaultValue: 'a', id: 'smoke-rg' },
        h(RadioBase as never, { value: 'a', children: 'A' }),
        h(RadioBase as never, { value: 'b', children: 'B' }),
      ),
    )
    const group = query<HTMLElement>(container, '#smoke-rg')
    expect(group.getAttribute('role')).toBe('radiogroup')

    const radios = container.querySelectorAll('[role="radio"]')
    expect(radios.length).toBe(2)

    // defaultValue 'a' → the value='a' radio carries checked state (aria + data),
    // the value='b' radio does not. This is the keyboard/SR-visible state.
    const selected = container.querySelector<HTMLElement>('[data-value="a"]')!
    const unselected = container.querySelector<HTMLElement>('[data-value="b"]')!
    expect(selected.getAttribute('role')).toBe('radio')
    expect(selected.getAttribute('aria-checked')).toBe('true')
    // the unselected radio reports aria-checked="false" explicitly (string),
    // not an absent/empty attr — so its state is announced correctly.
    expect(unselected.getAttribute('aria-checked')).toBe('false')
    expect(unselected.hasAttribute('data-checked')).toBe(false)

    unmount()
    expect(document.getElementById('smoke-rg')).toBeNull()
  })

  it('mounts TabsBase with role=tab items (active aria-selected) + exactly one active tabpanel', () => {
    const { container, unmount } = mountInBrowser(
      h(
        TabsBase as never,
        { defaultValue: 'a', id: 'smoke-tabs', role: 'tablist' },
        h(TabBase as never, { value: 'a', children: 'Tab A' }),
        h(TabBase as never, { value: 'b', children: 'Tab B' }),
        h(TabPanelBase as never, { value: 'a', children: 'Panel A' }),
        h(TabPanelBase as never, { value: 'b', children: 'Panel B' }),
      ),
    )
    const list = query<HTMLElement>(container, '#smoke-tabs')
    expect(list.getAttribute('role')).toBe('tablist')

    expect(container.querySelectorAll('[role="tab"]').length).toBe(2)

    // defaultValue 'a' → the value='a' tab is active: data-active + aria-selected present.
    const activeTab = container.querySelector<HTMLElement>('[data-value="a"]')!
    expect(activeTab.getAttribute('role')).toBe('tab')
    expect(activeTab.hasAttribute('data-active')).toBe(true)
    expect(activeTab.getAttribute('aria-selected')).toBe('true')

    // TabPanelBase conditional-renders on isActive → only the active panel is in the DOM.
    const panels = container.querySelectorAll('[role="tabpanel"]')
    expect(panels.length).toBe(1)
    expect(panels[0]!.textContent).toContain('Panel A')

    unmount()
    expect(document.getElementById('smoke-tabs')).toBeNull()
  })

  it('mounts ModalBase (open) with role=dialog + aria-modal, portaled into document.body', () => {
    const { unmount } = mountInBrowser(
      h(ModalBase as never, { open: true, id: 'smoke-modal', children: 'modal body' }),
    )
    // Portaled into document.body — query the document, not the container.
    const dialog = document.getElementById('smoke-modal')!
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.textContent).toContain('modal body')

    unmount()
    expect(document.getElementById('smoke-modal')).toBeNull()
  })

  it('mounts SliderBase as a native range input with aria-value* state', () => {
    const { container, unmount } = mountInBrowser(
      h(SliderBase as never, { defaultValue: 30, min: 0, max: 100, id: 'smoke-slider' }),
    )
    const slider = query<HTMLInputElement>(container, '#smoke-slider')
    expect(slider.tagName).toBe('INPUT')
    // <input type="range"> carries the implicit ARIA role "slider".
    expect(slider.getAttribute('type')).toBe('range')
    expect(slider.getAttribute('aria-valuenow')).toBe('30')
    expect(slider.getAttribute('aria-valuemin')).toBe('0')
    expect(slider.getAttribute('aria-valuemax')).toBe('100')

    unmount()
    expect(document.getElementById('smoke-slider')).toBeNull()
  })

  it('mounts TreeBase render-prop: treeProps() → role=tree, getItemProps() → role=treeitem', () => {
    const data = [{ id: '1', label: 'Root', children: [{ id: '1-1', label: 'Child' }] }]
    const { container, unmount } = mountInBrowser(
      h(TreeBase as never, {
        data,
        defaultExpanded: ['1'],
        // The render-prop chain is the a11y contract: state helpers → DOM roles.
        children: (state: TreeState) =>
          h(
            'ul',
            { ...state.treeProps(), id: 'smoke-tree' },
            ...state
              .visibleNodes()
              .map(({ node, depth }) =>
                h('li', state.getItemProps(node.id, depth, !!node.children?.length), node.label),
              ),
          ),
      }),
    )
    const tree = query<HTMLElement>(container, '#smoke-tree')
    expect(tree.getAttribute('role')).toBe('tree')

    const items = container.querySelectorAll('[role="treeitem"]')
    // Root + its expanded child both visible.
    expect(items.length).toBe(2)
    expect(items[0]!.getAttribute('aria-level')).toBe('1')
    // Root has children + is expanded → aria-expanded="true" (the STRING
    // value, not presence-only "").
    expect(items[0]!.getAttribute('aria-expanded')).toBe('true')

    unmount()
    expect(document.getElementById('smoke-tree')).toBeNull()
  })

  it('mounts ComboboxBase render-prop: inputProps()/listboxProps()/getOptionProps() → combobox/listbox/option', () => {
    const options = [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ]
    const { container, unmount } = mountInBrowser(
      h(ComboboxBase as never, {
        options,
        children: (state: ComboboxState) =>
          h(
            'div',
            null,
            h('input', { ...state.inputProps(), id: 'smoke-cbx' }),
            h(
              'ul',
              state.listboxProps(),
              ...options.map((o, i) => h('li', state.getOptionProps(o.value, i), o.label)),
            ),
          ),
      }),
    )
    const input = query<HTMLElement>(container, '#smoke-cbx')
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    // closed combobox → aria-expanded="false" (STRING value, not absent/"")
    expect(input.getAttribute('aria-expanded')).toBe('false')

    expect(container.querySelector('[role="listbox"]')).not.toBeNull()
    expect(container.querySelectorAll('[role="option"]').length).toBe(2)

    unmount()
    expect(document.getElementById('smoke-cbx')).toBeNull()
  })

  it('mounts ColorPickerBase render-prop: groupProps/hueSliderProps/saturationSliderProps/alphaSliderProps → role=group + role=slider with aria-value*', () => {
    const { container, unmount } = mountInBrowser(
      h(ColorPickerBase as never, {
        defaultValue: '#ff0000', // pure red → hue 0, saturation 100, brightness 100
        alpha: true,
        children: (state: ColorPickerState) =>
          h(
            'div',
            { ...state.groupProps(), id: 'smoke-cp' },
            h('div', { ...state.hueSliderProps(), 'data-cp': 'hue' }),
            h('div', { ...state.saturationSliderProps(), 'data-cp': 'sat' }),
            h('div', { ...state.alphaSliderProps(), 'data-cp': 'alpha' }),
          ),
      }),
    )

    const group = query<HTMLElement>(container, '#smoke-cp')
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-label')).toBe('Color picker')

    // hue slider — full 0–360° range, value 0 for pure red, numeric aria-value* render as strings
    const hue = container.querySelector<HTMLElement>('[data-cp="hue"]')!
    expect(hue.getAttribute('role')).toBe('slider')
    expect(hue.getAttribute('aria-valuemin')).toBe('0')
    expect(hue.getAttribute('aria-valuemax')).toBe('360')
    expect(hue.getAttribute('aria-valuenow')).toBe('0')
    expect(hue.getAttribute('aria-valuetext')).toBe('0 degrees')
    expect(hue.getAttribute('tabindex')).toBe('0')

    // 2-D saturation/brightness — single slider, both axes in aria-valuetext
    const sat = container.querySelector<HTMLElement>('[data-cp="sat"]')!
    expect(sat.getAttribute('role')).toBe('slider')
    expect(sat.getAttribute('aria-valuemax')).toBe('100')
    expect(sat.getAttribute('aria-valuenow')).toBe('100')
    expect(sat.getAttribute('aria-valuetext')).toContain('Saturation 100%')
    expect(sat.getAttribute('aria-valuetext')).toContain('brightness 100%')

    // alpha slider — default opacity 1 → 100%
    const alpha = container.querySelector<HTMLElement>('[data-cp="alpha"]')!
    expect(alpha.getAttribute('role')).toBe('slider')
    expect(alpha.getAttribute('aria-valuenow')).toBe('100')
    expect(alpha.getAttribute('aria-valuetext')).toBe('100%')

    unmount()
    expect(document.getElementById('smoke-cp')).toBeNull()
  })

  it('mounts CalendarBase as a WAI-ARIA grid: role=grid, columnheaders, gridcells with full-date aria-label + selected/today state, one roving tabIndex=0', () => {
    const { container, unmount } = mountInBrowser(
      h(CalendarBase as never, {
        // Jan 2026 — selected Jan 15; "today" is whatever the test clock says,
        // so we only assert today-driven state on the selected cell below.
        defaultValue: { year: 2026, month: 0, day: 15 },
        locale: 'en-US',
        children: (state: CalendarState) =>
          h(
            'div',
            { id: 'smoke-cal', ...state.gridProps() },
            h(
              'div',
              { ...state.rowProps },
              ...state.weekdays().map((wd) => h('span', { ...state.columnHeaderProps }, wd)),
            ),
            ...state.days().map((week) =>
              h(
                'div',
                { ...state.rowProps },
                ...week.map((day) =>
                  h(
                    'button',
                    {
                      ...state.getDayProps(day),
                      'data-day': `${day.date.year}-${day.date.month}-${day.date.day}`,
                      onClick: () => state.select(day.date),
                    },
                    String(day.date.day),
                  ),
                ),
              ),
            ),
          ),
      }),
    )

    const grid = query<HTMLElement>(container, '#smoke-cal')
    expect(grid.getAttribute('role')).toBe('grid')
    expect(grid.getAttribute('aria-label')).toContain('January')
    expect(grid.getAttribute('aria-label')).toContain('2026')

    // 7 weekday column headers
    expect(container.querySelectorAll('[role="columnheader"]').length).toBe(7)

    // gridcells for the full month grid (≥ 28 cells across whole weeks)
    const cells = container.querySelectorAll('[role="gridcell"]')
    expect(cells.length).toBeGreaterThanOrEqual(28)

    // exactly ONE roving tab stop (WAI-ARIA grid pattern)
    expect(container.querySelectorAll('[role="gridcell"][tabindex="0"]').length).toBe(1)

    // the selected day (Jan 15 2026) carries STRING aria-selected="true" (not
    // presence-only ""), a full-date aria-label, and IS the roving tab stop.
    const jan15 = container.querySelector<HTMLElement>('[data-day="2026-0-15"]')!
    expect(jan15.getAttribute('aria-selected')).toBe('true')
    expect(jan15.getAttribute('tabindex')).toBe('0')
    expect(jan15.getAttribute('aria-label')).toContain('January 15, 2026')

    // a non-selected current-month day reports aria-selected="false" + tabindex -1
    const jan10 = container.querySelector<HTMLElement>('[data-day="2026-0-10"]')!
    expect(jan10.getAttribute('aria-selected')).toBe('false')
    expect(jan10.getAttribute('tabindex')).toBe('-1')

    unmount()
    expect(document.getElementById('smoke-cal')).toBeNull()
  })
})
