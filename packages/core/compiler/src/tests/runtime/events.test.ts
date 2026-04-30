// @vitest-environment happy-dom
/// <reference lib="dom" />
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { compileAndMount } from './harness'

/**
 * Compiler-runtime tests — event handler emission.
 *
 * Coverage matrix: delegated (single-word common events) vs non-delegated
 * (multi-word + uncommon) × static handler ref vs inline arrow × event
 * dispatch hits the handler. The #352 event-name casing bug surfaced
 * because non-delegated events used the wrong casing; this file locks in
 * each shape independently.
 */

describe('compiler-runtime — events', () => {
  // ── Delegated events (single-word, common) ──────────────────────────
  it('onClick fires on bubbled click', () => {
    let fired = 0
    const handler = () => {
      fired++
    }
    const { container, unmount } = compileAndMount(
      `<div><button id="b" onClick={handler}>x</button></div>`,
      { handler },
    )
    container.querySelector<HTMLButtonElement>('#b')!.click()
    expect(fired).toBe(1)
    unmount()
  })

  it('onClick with inline arrow handler fires', () => {
    const count = signal(0)
    const { container, unmount } = compileAndMount(
      `<div><button id="b" onClick={() => count.set(count() + 1)}>x</button></div>`,
      { count },
    )
    const btn = container.querySelector<HTMLButtonElement>('#b')!
    btn.click()
    btn.click()
    expect(count()).toBe(2)
    unmount()
  })

  it('onInput fires on real input event', () => {
    let value = ''
    const handler = (e: Event) => {
      value = (e.target as HTMLInputElement).value
    }
    const { container, unmount } = compileAndMount(
      `<div><input id="i" onInput={handler} /></div>`,
      { handler },
    )
    const input = container.querySelector<HTMLInputElement>('#i')!
    input.value = 'hello'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(value).toBe('hello')
    unmount()
  })

  it('onChange fires on real change event', () => {
    let changed = 0
    const handler = () => {
      changed++
    }
    const { container, unmount } = compileAndMount(
      `<div><input id="i" onChange={handler} /></div>`,
      { handler },
    )
    container
      .querySelector<HTMLInputElement>('#i')!
      .dispatchEvent(new Event('change', { bubbles: true }))
    expect(changed).toBe(1)
    unmount()
  })

  it('onSubmit fires on form submit', () => {
    let submitted = 0
    const handler = (e: Event) => {
      e.preventDefault()
      submitted++
    }
    const { container, unmount } = compileAndMount(
      `<div><form id="f" onSubmit={handler}><button type="submit">go</button></form></div>`,
      { handler },
    )
    const form = container.querySelector<HTMLFormElement>('#f')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(submitted).toBe(1)
    unmount()
  })

  it('onFocus fires on focus event', () => {
    let focused = 0
    const handler = () => {
      focused++
    }
    const { container, unmount } = compileAndMount(
      `<div><input id="i" onFocus={handler} /></div>`,
      { handler },
    )
    container
      .querySelector<HTMLInputElement>('#i')!
      .dispatchEvent(new Event('focus', { bubbles: true }))
    expect(focused).toBe(1)
    unmount()
  })

  it('onBlur fires on blur event', () => {
    let blurred = 0
    const handler = () => {
      blurred++
    }
    const { container, unmount } = compileAndMount(
      `<div><input id="i" onBlur={handler} /></div>`,
      { handler },
    )
    container
      .querySelector<HTMLInputElement>('#i')!
      .dispatchEvent(new Event('blur', { bubbles: true }))
    expect(blurred).toBe(1)
    unmount()
  })

  // ── Non-delegated events (multi-word — were broken pre-#352) ────────
  it('onKeyDown fires (multi-word event-name lowercase regression)', () => {
    let key = ''
    const handler = (e: KeyboardEvent) => {
      key = e.key
    }
    const { container, unmount } = compileAndMount(
      `<div><input id="i" onKeyDown={handler} /></div>`,
      { handler },
    )
    container
      .querySelector<HTMLInputElement>('#i')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(key).toBe('Tab')
    unmount()
  })

  it('onKeyUp fires (multi-word event-name lowercase regression)', () => {
    let key = ''
    const handler = (e: KeyboardEvent) => {
      key = e.key
    }
    const { container, unmount } = compileAndMount(
      `<div><input id="i" onKeyUp={handler} /></div>`,
      { handler },
    )
    container
      .querySelector<HTMLInputElement>('#i')!
      .dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    expect(key).toBe('Enter')
    unmount()
  })

  it('onMouseEnter fires (non-bubbling event)', () => {
    let entered = 0
    const handler = () => {
      entered++
    }
    const { container, unmount } = compileAndMount(
      `<div><span id="s" onMouseEnter={handler}>hover</span></div>`,
      { handler },
    )
    container
      .querySelector<HTMLSpanElement>('#s')!
      .dispatchEvent(new MouseEvent('mouseenter'))
    expect(entered).toBe(1)
    unmount()
  })

  it('onPointerLeave fires (non-bubbling event)', () => {
    let left = 0
    const handler = () => {
      left++
    }
    const { container, unmount } = compileAndMount(
      `<div><span id="s" onPointerLeave={handler}>hover</span></div>`,
      { handler },
    )
    container
      .querySelector<HTMLSpanElement>('#s')!
      .dispatchEvent(new PointerEvent('pointerleave'))
    expect(left).toBe(1)
    unmount()
  })

  // Locks in the React→DOM event-name mapping for `onDoubleClick` →
  // `dblclick`. The mapping lives in BOTH compiler backends:
  //   - JS fallback: packages/core/compiler/src/jsx.ts (doubleclick → dblclick)
  //   - Rust native: packages/core/compiler/native/src/lib.rs (same shape)
  // `onContextMenu` lowercases correctly (contextmenu) — no remap needed.
  it('onDoubleClick fires (multi-word + delegated)', () => {
    let dbl = 0
    const handler = () => {
      dbl++
    }
    const { container, unmount } = compileAndMount(
      `<div><button id="b" onDoubleClick={handler}>x</button></div>`,
      { handler },
    )
    container
      .querySelector<HTMLButtonElement>('#b')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(dbl).toBe(1)
    unmount()
  })

  it('onContextMenu fires (multi-word, lowercases to contextmenu)', () => {
    let menu = 0
    const handler = () => {
      menu++
    }
    const { container, unmount } = compileAndMount(
      `<div><button id="b" onContextMenu={handler}>x</button></div>`,
      { handler },
    )
    container
      .querySelector<HTMLButtonElement>('#b')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    expect(menu).toBe(1)
    unmount()
  })
})
