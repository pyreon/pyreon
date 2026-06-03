import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import {
  CheckboxBase,
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
    // `defaultChecked: true` → aria-checked attribute is present in DOM
    // (Pyreon renders boolean-true as empty-string attr). Testing the
    // toggle interaction belongs in unit tests, not the browser smoke.
    expect(sw.hasAttribute('aria-checked')).toBe(true)

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
    expect(cb.hasAttribute('aria-checked')).toBe(true)

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
    expect(selected.hasAttribute('aria-checked')).toBe(true)
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
    expect(activeTab.hasAttribute('aria-selected')).toBe(true)

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
    // Root has children + is expanded → aria-expanded present (Pyreon renders
    // boolean-true as an empty-string attr, same as aria-checked above).
    expect(items[0]!.hasAttribute('aria-expanded')).toBe(true)

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

    expect(container.querySelector('[role="listbox"]')).not.toBeNull()
    expect(container.querySelectorAll('[role="option"]').length).toBe(2)

    unmount()
    expect(document.getElementById('smoke-cbx')).toBeNull()
  })
})
