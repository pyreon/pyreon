/**
 * State-transition (interaction) coverage for the toggle/selection primitives
 * `CheckboxBase`, `SwitchBase`, and `RadioGroupBase`/`RadioBase`.
 *
 * The existing `aria-state.browser.test.tsx` suite asserts only the INITIAL
 * ARIA. The state MACHINE — click / Space / Enter → `toggle()` / `select()`,
 * `onChange` firing, the disabled guard, and controlled mode — was
 * unexercised: the exact gap the coverage baseline names ("Checkbox/Switch …
 * state machines largely unexercised — which is why interaction bugs shipped").
 *
 * REAL-BROWSER contract split: `CheckboxBase` and `RadioBase` render a hidden
 * `<input>` inside their `<label>`. In a real browser a label click is
 * FORWARDED to that input (firing the input's onChange) and bubbles back to
 * the label's onClick — so without the `preventDefault` fix a single click
 * fires onChange THREE times. happy-dom models this forwarding differently (it
 * forwards even past `preventDefault`), so the EXACT single-fire count that the
 * fix guarantees is only faithfully observable in Chromium — those assertions
 * live in `describe.runIf(isBrowser)` blocks. The state-machine CODE
 * (toggle/select/keydown/disabled-guard) is still fully exercised in node
 * (happy-dom) by the env-consistent tests below, so coverage is unaffected.
 *
 * House pattern: real Chromium (`mountInBrowser`) + `dispatchEvent` for the
 * component's OWN handlers + `flush()` + aria-VALUE assertions.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { query } from '@pyreon/test-utils'
import { CheckboxBase, RadioBase, RadioGroupBase, SwitchBase } from './index'

declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__

const click = (el: Element) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
const key = (el: Element, k: string) =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
  )

// ─── CheckboxBase ────────────────────────────────────────────────────────────

describe('CheckboxBase — state machine (env-consistent)', () => {
  it('initial ARIA: role=checkbox, aria-checked="false", not disabled, tabindex=0', () => {
    const { container } = mountInBrowser(
      h(CheckboxBase as never, { id: 'cb0', defaultChecked: false }),
    )
    const el = query<HTMLElement>(container, '#cb0')
    expect(el.getAttribute('role')).toBe('checkbox')
    expect(el.getAttribute('aria-checked')).toBe('false')
    expect(el.getAttribute('aria-disabled')).toBe(null)
    expect(el.getAttribute('tabindex')).toBe('0')
  })

  it('defaultChecked renders aria-checked="true" (+ data-checked present)', () => {
    const { container } = mountInBrowser(
      h(CheckboxBase as never, { id: 'cb1', defaultChecked: true }),
    )
    const el = query<HTMLElement>(container, '#cb1')
    expect(el.getAttribute('aria-checked')).toBe('true')
    // `data-checked={checked() || undefined}` — boolean true renders as a
    // presence attribute (empty value), not the string "true".
    expect(el.getAttribute('data-checked')).toBe('')
  })

  it('Space and Enter fire the toggle; other keys do not (keydown does not forward)', async () => {
    const calls: boolean[] = []
    const { container } = mountInBrowser(
      h(CheckboxBase as never, {
        id: 'cb3',
        defaultChecked: false,
        onChange: (v: boolean) => calls.push(v),
      }),
    )
    const el = query<HTMLElement>(container, '#cb3')
    key(el, 'a')
    await flush()
    expect(calls).toEqual([])
    key(el, ' ')
    await flush()
    key(el, 'Enter')
    await flush()
    expect(calls).toEqual([true, false])
  })

  it('disabled: click + Space are no-ops (onChange never fires); aria-disabled="true", tabindex=-1', async () => {
    const calls: boolean[] = []
    const { container } = mountInBrowser(
      h(CheckboxBase as never, {
        id: 'cb4',
        disabled: true,
        onChange: (v: boolean) => calls.push(v),
      }),
    )
    const el = query<HTMLElement>(container, '#cb4')
    expect(el.getAttribute('aria-disabled')).toBe('true')
    expect(el.getAttribute('data-disabled')).toBe('')
    expect(el.getAttribute('tabindex')).toBe('-1')
    click(el)
    await flush()
    key(el, ' ')
    await flush()
    expect(calls).toEqual([])
  })

  it('indeterminate renders aria-checked="mixed"', () => {
    const { container } = mountInBrowser(
      h(CheckboxBase as never, { id: 'cb6', indeterminate: true }),
    )
    expect(query<HTMLElement>(container, '#cb6').getAttribute('aria-checked')).toBe(
      'mixed',
    )
  })
})

describe.runIf(isBrowser)('CheckboxBase — click contract (real Chromium)', () => {
  it('click fires onChange EXACTLY once per click, with the flipped value', async () => {
    const calls: boolean[] = []
    const { container } = mountInBrowser(
      h(CheckboxBase as never, {
        id: 'cbc1',
        defaultChecked: false,
        onChange: (v: boolean) => calls.push(v),
      }),
    )
    const el = query<HTMLElement>(container, '#cbc1')
    click(el)
    await flush()
    expect(calls).toEqual([true])
    click(el)
    await flush()
    expect(calls).toEqual([true, false])
  })

  it('controlled: click fires onChange once with the flipped value (parent owns state)', async () => {
    const calls: boolean[] = []
    const { container } = mountInBrowser(
      h(CheckboxBase as never, {
        id: 'cbc2',
        checked: true,
        onChange: (v: boolean) => calls.push(v),
      }),
    )
    const el = query<HTMLElement>(container, '#cbc2')
    expect(el.getAttribute('aria-checked')).toBe('true')
    click(el)
    await flush()
    expect(calls).toEqual([false])
  })
})

// ─── SwitchBase (no hidden input → click is single-fire in every runtime) ─────

describe('SwitchBase — toggle state machine', () => {
  it('initial ARIA: role=switch, aria-checked reflects defaultChecked', () => {
    const off = mountInBrowser(h(SwitchBase as never, { id: 'sw0' }))
    const el = query<HTMLElement>(off.container, '#sw0')
    expect(el.getAttribute('role')).toBe('switch')
    expect(el.getAttribute('aria-checked')).toBe('false')

    const on = mountInBrowser(
      h(SwitchBase as never, { id: 'sw0b', defaultChecked: true }),
    )
    expect(query<HTMLElement>(on.container, '#sw0b').getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('click fires onChange once per click with the flipped value', async () => {
    const calls: boolean[] = []
    const { container } = mountInBrowser(
      h(SwitchBase as never, {
        id: 'sw1',
        defaultChecked: false,
        onChange: (v: boolean) => calls.push(v),
      }),
    )
    const el = query<HTMLElement>(container, '#sw1')
    click(el)
    await flush()
    expect(calls).toEqual([true])
    click(el)
    await flush()
    expect(calls).toEqual([true, false])
  })

  it('Space and Enter toggle', async () => {
    const calls: boolean[] = []
    const { container } = mountInBrowser(
      h(SwitchBase as never, {
        id: 'sw2',
        defaultChecked: false,
        onChange: (v: boolean) => calls.push(v),
      }),
    )
    const el = query<HTMLElement>(container, '#sw2')
    key(el, ' ')
    await flush()
    key(el, 'Enter')
    await flush()
    expect(calls).toEqual([true, false])
  })

  it('disabled: click is a no-op (onChange never fires); aria-disabled="true", tabindex=-1', async () => {
    const calls: boolean[] = []
    const { container } = mountInBrowser(
      h(SwitchBase as never, {
        id: 'sw3',
        disabled: true,
        onChange: (v: boolean) => calls.push(v),
      }),
    )
    const el = query<HTMLElement>(container, '#sw3')
    expect(el.getAttribute('aria-disabled')).toBe('true')
    expect(el.getAttribute('tabindex')).toBe('-1')
    click(el)
    await flush()
    expect(calls).toEqual([])
  })

  it('controlled: click fires onChange once with the flipped value', async () => {
    const calls: boolean[] = []
    const { container } = mountInBrowser(
      h(SwitchBase as never, {
        id: 'sw4',
        checked: false,
        onChange: (v: boolean) => calls.push(v),
      }),
    )
    click(query<HTMLElement>(container, '#sw4'))
    await flush()
    expect(calls).toEqual([true])
  })
})

// ─── RadioGroupBase / RadioBase ──────────────────────────────────────────────

const mountGroup = (
  onChange: (v: string) => void,
  extra: Record<string, unknown> = {},
) =>
  mountInBrowser(
    h(RadioGroupBase as never, {
      id: 'rg',
      onChange,
      ...extra,
      children: [
        h(RadioBase as never, { value: 'a', id: 'r-a' }),
        h(RadioBase as never, { value: 'b', id: 'r-b' }),
        h(RadioBase as never, { value: 'c', id: 'r-c', disabled: true }),
      ],
    }),
  )

describe('RadioGroupBase / RadioBase — selection (env-consistent)', () => {
  it('Space/Enter on a radio selects it', async () => {
    const calls: string[] = []
    const { container } = mountGroup((v) => calls.push(v))
    key(query<HTMLElement>(container, '#r-b'), ' ')
    await flush()
    expect(calls).toEqual(['b'])
  })

  it('a disabled radio does not fire onChange on click', async () => {
    const calls: string[] = []
    const { container } = mountGroup((v) => calls.push(v))
    const c = query<HTMLElement>(container, '#r-c')
    expect(c.getAttribute('aria-disabled')).toBe('true')
    click(c)
    await flush()
    expect(calls).toEqual([])
  })

  it('defaultValue marks the matching radio aria-checked="true"', () => {
    const { container } = mountGroup(() => {}, { defaultValue: 'b' })
    expect(query<HTMLElement>(container, '#r-b').getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(query<HTMLElement>(container, '#r-a').getAttribute('aria-checked')).toBe(
      'false',
    )
  })
})

describe.runIf(isBrowser)('RadioBase — click contract (real Chromium)', () => {
  it('clicking a radio fires onChange EXACTLY once with that value', async () => {
    const calls: string[] = []
    const { container } = mountGroup((v) => calls.push(v))
    click(query<HTMLElement>(container, '#r-b'))
    await flush()
    expect(calls).toEqual(['b'])
    click(query<HTMLElement>(container, '#r-a'))
    await flush()
    expect(calls).toEqual(['b', 'a'])
  })
})
