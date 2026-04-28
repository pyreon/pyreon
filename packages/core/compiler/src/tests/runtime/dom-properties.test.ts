// @vitest-environment happy-dom
/// <reference lib="dom" />
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { flush } from '@pyreon/test-utils/browser'
import { compileAndMount } from './harness'

/**
 * Compiler-runtime tests — DOM-property assignment.
 *
 * The #352 DOM-property bug used `setAttribute("value", v)` instead of
 * `el.value = v` for IDL properties whose live value diverges from the
 * content attribute. The fix added a `DOM_PROPS` set covering: value,
 * checked, selected, disabled, multiple, readOnly, indeterminate. This
 * file pins down each property + asserts the compiled output uses
 * property assignment so the live state reflects updates correctly.
 *
 * Note: happy-dom's `.value` getter follows the attribute even in
 * static cases, so for `value` specifically the assertion verifies
 * the post-update read works (which would also work via setAttribute
 * in happy-dom — the real differentiator is in real Chromium after a
 * user types). For `checked` / `disabled` / etc., happy-dom DOES
 * differentiate property vs attribute, so those assertions are robust.
 */

describe('compiler-runtime — DOM properties', () => {
  it('value property reflects signal updates via .value', async () => {
    const text = signal('initial')
    const { container, unmount } = compileAndMount(
      `<div><input id="i" value={() => text()} /></div>`,
      { text },
    )
    const input = container.querySelector<HTMLInputElement>('#i')!
    expect(input.value).toBe('initial')
    text.set('updated')
    await flush()
    expect(input.value).toBe('updated')
    text.set('')
    await flush()
    expect(input.value).toBe('')
    unmount()
  })

  it('checked property reflects via .checked (not boolean attribute)', async () => {
    const isOn = signal(true)
    const { container, unmount } = compileAndMount(
      `<div><input id="c" type="checkbox" checked={() => isOn()} /></div>`,
      { isOn },
    )
    const cb = container.querySelector<HTMLInputElement>('#c')!
    expect(cb.checked).toBe(true)
    isOn.set(false)
    await flush()
    expect(cb.checked).toBe(false)
    isOn.set(true)
    await flush()
    expect(cb.checked).toBe(true)
    unmount()
  })

  it('disabled property reflects via .disabled', async () => {
    const off = signal(false)
    const { container, unmount } = compileAndMount(
      `<div><button id="b" disabled={() => off()}>x</button></div>`,
      { off },
    )
    const btn = container.querySelector<HTMLButtonElement>('#b')!
    expect(btn.disabled).toBe(false)
    off.set(true)
    await flush()
    expect(btn.disabled).toBe(true)
    off.set(false)
    await flush()
    expect(btn.disabled).toBe(false)
    unmount()
  })

  it('selected on <option> reflects via .selected', async () => {
    // Need a sibling option so the browser's "at least one option must
    // be selected" auto-selection doesn't pick our option after we
    // unselect it.
    const sel = signal(false)
    const { container, unmount } = compileAndMount(
      `<div><select><option>first</option><option id="o" selected={() => sel()}>a</option></select></div>`,
      { sel },
    )
    const opt = container.querySelector<HTMLOptionElement>('#o')!
    expect(opt.selected).toBe(false)
    sel.set(true)
    await flush()
    expect(opt.selected).toBe(true)
    unmount()
  })

  it('multiple on <select> reflects via .multiple', async () => {
    const multi = signal(true)
    const { container, unmount } = compileAndMount(
      `<div><select id="s" multiple={() => multi()}><option>a</option></select></div>`,
      { multi },
    )
    const sel = container.querySelector<HTMLSelectElement>('#s')!
    expect(sel.multiple).toBe(true)
    multi.set(false)
    await flush()
    expect(sel.multiple).toBe(false)
    unmount()
  })

  it('readOnly on <input> reflects via .readOnly', async () => {
    const ro = signal(false)
    const { container, unmount } = compileAndMount(
      `<div><input id="i" readOnly={() => ro()} /></div>`,
      { ro },
    )
    const input = container.querySelector<HTMLInputElement>('#i')!
    expect(input.readOnly).toBe(false)
    ro.set(true)
    await flush()
    expect(input.readOnly).toBe(true)
    unmount()
  })

  it('non-DOM-prop attributes still go through setAttribute', async () => {
    // `placeholder` is a real HTML attribute, not a DOM IDL property
    // that diverges. Should still flow through setAttribute (not break).
    const placeholder = signal('type here')
    const { container, unmount } = compileAndMount(
      `<div><input id="i" placeholder={() => placeholder()} /></div>`,
      { placeholder },
    )
    const input = container.querySelector<HTMLInputElement>('#i')!
    expect(input.getAttribute('placeholder')).toBe('type here')
    placeholder.set('changed')
    await flush()
    expect(input.getAttribute('placeholder')).toBe('changed')
    unmount()
  })
})
