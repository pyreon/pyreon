// @vitest-environment happy-dom
/// <reference lib="dom" />
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { flush } from '@pyreon/test-utils/browser'
import { compileAndMount } from './harness'

/**
 * Compiler-runtime regression tests for the 4 bug shapes shipped in PR #352.
 *
 * Each test was bisect-verifiable when the corresponding compiler fix was
 * reverted. They are the proof-of-approach for the harness — small,
 * focused, observable-behavior assertions against compiled JSX in real
 * Chromium. Phase B2 expands this set to ~50 representative shapes.
 */

describe('compiler-runtime — PR #352 bug shapes (real Chromium)', () => {
  // ── Bug 1: event-name casing ────────────────────────────────────────
  // Before #352 the compiler emitted `__ev_keyDown` (camelCase) instead
  // of `__ev_keydown`. The browser dispatches lowercase event names
  // exclusively, so multi-word handlers never fired. With the fix in
  // place the keydown event correctly invokes the handler.
  it('multi-word event names are lowercased so browser dispatch hits them', async () => {
    let pressedKey = ''
    const handleKey = (e: KeyboardEvent) => {
      pressedKey = e.key
    }
    const { container, unmount } = compileAndMount(
      `<div><input id="ev" onKeyDown={handleKey} /></div>`,
      { handleKey },
    )
    const input = container.querySelector<HTMLInputElement>('#ev')!
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(pressedKey).toBe('Enter')
    unmount()
  })

  // ── Bug 2: signal-method auto-call ──────────────────────────────────
  // Before #352 the compiler auto-called bare signal references in JSX
  // event handlers, rewriting `input.set(x)` to `input().set(x)`. Click
  // handlers calling `signal.set(...)` silently failed (TypeError on
  // string `.set`). With the fix in place the click correctly invokes
  // the setter.
  it('signal.method() in event handlers is NOT double-called', async () => {
    const count = signal(0)
    const { container, unmount } = compileAndMount(
      `<div><button id="b" onClick={() => count.set(count() + 1)}>+</button></div>`,
      { count },
    )
    const btn = container.querySelector<HTMLButtonElement>('#b')!
    btn.click()
    btn.click()
    btn.click()
    expect(count()).toBe(3)
    unmount()
  })

  // ── Bug 3: JSX text/expression whitespace ───────────────────────────
  // Before #352 same-line whitespace adjacent to expressions was
  // stripped: `<p>doubled: {x}</p>` rendered "doubled:0" not
  // "doubled: 0". With the fix in place (React/Babel
  // cleanJSXElementLiteralChild algorithm) the trailing space survives.
  it('same-line whitespace before an expression is preserved', async () => {
    const x = signal(7)
    const { container, unmount } = compileAndMount(
      `<div><p id="p">doubled: {x()}</p></div>`,
      { x },
    )
    const p = container.querySelector('#p')!
    expect(p.textContent).toBe('doubled: 7')
    x.set(42)
    await flush()
    expect(p.textContent).toBe('doubled: 42')
    unmount()
  })

  // ── Bug 4a: DOM-property assignment (value) ─────────────────────────
  // Before #352 the compiler emitted `setAttribute("value", v)` for
  // input value. The HTML attribute and the live `.value` property
  // diverge after the user types — clearing the signal then only reset
  // the attribute, leaving stale text. With the fix in place the
  // compiler emits `el.value = v` so the live property reflects.
  it('input value uses the .value property (not setAttribute)', async () => {
    const text = signal('hello')
    const { container, unmount } = compileAndMount(
      `<div><input id="t" value={() => text()} /></div>`,
      { text },
    )
    const input = container.querySelector<HTMLInputElement>('#t')!
    expect(input.value).toBe('hello')
    text.set('world')
    await flush()
    expect(input.value).toBe('world')
    text.set('')
    await flush()
    expect(input.value).toBe('')
    unmount()
  })

  // ── Bug 4b: DOM-property assignment (checked) ───────────────────────
  // Before #352 the compiler used `setAttribute("checked", ...)` for
  // checkbox state. Presence of the attribute means "checked" in HTML
  // regardless of value, so toggling a signal didn't uncheck the box.
  // With the fix in place the compiler emits `el.checked = v`.
  it('checkbox checked uses the .checked property (not setAttribute)', async () => {
    const done = signal(true)
    const { container, unmount } = compileAndMount(
      `<div><input id="c" type="checkbox" checked={() => done()} /></div>`,
      { done },
    )
    const cb = container.querySelector<HTMLInputElement>('#c')!
    expect(cb.checked).toBe(true)
    done.set(false)
    await flush()
    expect(cb.checked).toBe(false)
    done.set(true)
    await flush()
    expect(cb.checked).toBe(true)
    unmount()
  })
})
