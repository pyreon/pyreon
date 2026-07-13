import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import {
  CheckboxBase,
  RadioBase,
  RadioGroupBase,
  SelectBase,
  SliderBase,
  SwitchBase,
  TabBase,
  TabsBase,
  TreeBase,
  type TreeState,
} from './index'

/**
 * ARIA-STATE string-contract lock for `@pyreon/ui-primitives`.
 *
 * WAI-ARIA state/property attributes (`aria-checked`, `aria-selected`,
 * `aria-invalid`, `aria-disabled`, `aria-multiselectable`, …) are STRING
 * enums ("true"/"false"/"mixed"), NOT HTML presence booleans. A boolean
 * `true` that reaches the DOM as presence-only `aria-checked=""` is an
 * INVALID ARIA value — assistive tech falls back to the attribute's default
 * (unchecked / not-selected / valid), announcing the OPPOSITE of the intended
 * state. See `.claude/rules/anti-patterns.md` "Boolean ARIA-STATE attributes".
 *
 * DETECTION TRAP (this suite avoids it): `el.hasAttribute('aria-checked')`
 * passes for BOTH `""` and `"true"`, masking the bug. Every assertion below
 * checks the VALUE (`getAttribute(...) === 'true'`) for the set case AND
 * asserts ABSENCE (`=== null`) for the unset case — a string `x ? 'true' :
 * undefined` OMITS the attribute, while a boolean `x || undefined` would leak
 * `aria-invalid=""` in the compiled reactive-attr path.
 *
 * NOTE ON THE HARNESS: this package's browser config uses the default oxc
 * automatic JSX runtime, so these mounts flow through the runtime
 * `applyProps` → `applyStaticProp` path, whose aria-boolean coercion
 * (`runtime-dom/src/props.ts`) is a SAFETY NET that currently masks the
 * boolean form in this harness. These specs therefore lock the string
 * contract going FORWARD (and would catch a boolean reintroduced on a path
 * the safety net doesn't cover, e.g. a custom element or a direct property
 * set); the load-bearing bisect that proves the source fix is in the PR body.
 */
describe('@pyreon/ui-primitives — ARIA-STATE string contract', () => {
  it('SwitchBase: aria-checked reflects state as a STRING; aria-invalid set → "true", unset → absent', () => {
    const on = mountInBrowser(h(SwitchBase as never, { id: 's-on', defaultChecked: true }))
    expect(query<HTMLElement>(on.container, '#s-on').getAttribute('aria-checked')).toBe('true')

    const off = mountInBrowser(h(SwitchBase as never, { id: 's-off', defaultChecked: false }))
    expect(query<HTMLElement>(off.container, '#s-off').getAttribute('aria-checked')).toBe('false')

    const inv = mountInBrowser(h(SwitchBase as never, { id: 's-inv', 'aria-invalid': true }))
    expect(query<HTMLElement>(inv.container, '#s-inv').getAttribute('aria-invalid')).toBe('true')

    const ok = mountInBrowser(h(SwitchBase as never, { id: 's-ok' }))
    expect(query<HTMLElement>(ok.container, '#s-ok').getAttribute('aria-invalid')).toBe(null)
  })

  it('CheckboxBase: aria-checked "true"/"false"/"mixed"; aria-invalid set → "true", unset → absent', () => {
    const on = mountInBrowser(h(CheckboxBase as never, { id: 'c-on', defaultChecked: true }))
    expect(query<HTMLElement>(on.container, '#c-on').getAttribute('aria-checked')).toBe('true')

    const mixed = mountInBrowser(h(CheckboxBase as never, { id: 'c-mix', indeterminate: true }))
    expect(query<HTMLElement>(mixed.container, '#c-mix').getAttribute('aria-checked')).toBe('mixed')

    const inv = mountInBrowser(h(CheckboxBase as never, { id: 'c-inv', 'aria-invalid': true }))
    expect(query<HTMLElement>(inv.container, '#c-inv').getAttribute('aria-invalid')).toBe('true')

    const ok = mountInBrowser(h(CheckboxBase as never, { id: 'c-ok' }))
    expect(query<HTMLElement>(ok.container, '#c-ok').getAttribute('aria-invalid')).toBe(null)
  })

  it('SelectBase: aria-invalid set → "true", unset → absent', () => {
    const inv = mountInBrowser(h(SelectBase as never, { id: 'sel-inv', 'aria-invalid': true }))
    expect(query<HTMLElement>(inv.container, '#sel-inv').getAttribute('aria-invalid')).toBe('true')

    const ok = mountInBrowser(h(SelectBase as never, { id: 'sel-ok' }))
    expect(query<HTMLElement>(ok.container, '#sel-ok').getAttribute('aria-invalid')).toBe(null)
  })

  it('SliderBase: aria-disabled + aria-invalid set → "true", unset → absent (never presence-only "")', () => {
    const dis = mountInBrowser(
      h(SliderBase as never, { id: 'sl-dis', disabled: true, 'aria-invalid': true }),
    )
    const disEl = query<HTMLElement>(dis.container, '#sl-dis')
    expect(disEl.getAttribute('aria-disabled')).toBe('true')
    expect(disEl.getAttribute('aria-invalid')).toBe('true')

    const ok = mountInBrowser(h(SliderBase as never, { id: 'sl-ok' }))
    const okEl = query<HTMLElement>(ok.container, '#sl-ok')
    expect(okEl.getAttribute('aria-disabled')).toBe(null)
    expect(okEl.getAttribute('aria-invalid')).toBe(null)
  })

  it('RadioGroupBase: aria-invalid set → "true", unset → absent; RadioBase aria-checked is a STRING', () => {
    const inv = mountInBrowser(
      h(RadioGroupBase as never, {
        id: 'rg-inv',
        'aria-invalid': true,
        defaultValue: 'a',
        children: [
          h(RadioBase as never, { value: 'a', id: 'r-a' }),
          h(RadioBase as never, { value: 'b', id: 'r-b' }),
        ],
      }),
    )
    expect(query<HTMLElement>(inv.container, '#rg-inv').getAttribute('aria-invalid')).toBe('true')
    expect(query<HTMLElement>(inv.container, '#r-a').getAttribute('aria-checked')).toBe('true')
    expect(query<HTMLElement>(inv.container, '#r-b').getAttribute('aria-checked')).toBe('false')

    const ok = mountInBrowser(h(RadioGroupBase as never, { id: 'rg-ok' }))
    expect(query<HTMLElement>(ok.container, '#rg-ok').getAttribute('aria-invalid')).toBe(null)
  })

  it('TabBase: aria-selected is a STRING for active AND inactive tabs', () => {
    const { container } = mountInBrowser(
      h(
        TabsBase as never,
        { defaultValue: 'one', role: 'tablist' },
        h(TabBase as never, { value: 'one', children: 'One' }),
        h(TabBase as never, { value: 'two', children: 'Two' }),
      ),
    )
    expect(query<HTMLElement>(container, '[data-value="one"]').getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(query<HTMLElement>(container, '[data-value="two"]').getAttribute('aria-selected')).toBe(
      'false',
    )
  })

  it('TreeBase: aria-multiselectable "true" when multiple, ABSENT otherwise (never "")', () => {
    const multi = mountInBrowser(
      h(TreeBase as never, {
        data: [{ id: 'a', label: 'A' }],
        multiple: true,
        children: (s: TreeState) => h('ul', { ...s.treeProps(), id: 'tr-multi' }),
      }),
    )
    expect(query<HTMLElement>(multi.container, '#tr-multi').getAttribute('aria-multiselectable')).toBe(
      'true',
    )

    const single = mountInBrowser(
      h(TreeBase as never, {
        data: [{ id: 'a', label: 'A' }],
        children: (s: TreeState) => h('ul', { ...s.treeProps(), id: 'tr-single' }),
      }),
    )
    expect(
      query<HTMLElement>(single.container, '#tr-single').getAttribute('aria-multiselectable'),
    ).toBe(null)
  })
})
