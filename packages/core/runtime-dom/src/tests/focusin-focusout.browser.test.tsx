import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it, vi } from 'vitest'

// Real-Chromium proof for the `onFocusIn` / `onFocusOut` JSX events.
//
// happy-dom unit tests (props.test.ts) dispatch a SYNTHETIC `FocusEvent` through
// the real delegation dispatcher. This suite uses ACTUAL element `.focus()` /
// `.blur()` in real Chromium — the only faithful test of the keyboard-focus
// path the Toaster's pause-on-focus relies on: real focus fires `focus` +
// (bubbling) `focusin`, which must reach a container handler via delegation.

describe('onFocusIn / onFocusOut (real browser focus)', () => {
  it('fires the container handler when a DESCENDANT is really focused/blurred', () => {
    const onIn = vi.fn()
    const onOut = vi.fn()

    // <section onFocusIn onFocusOut><button>…</button></section>
    const { container, unmount } = mountInBrowser(
      h(
        'section',
        { onFocusIn: onIn, onFocusOut: onOut },
        h('button', { id: 'fcb', type: 'button' }, 'focus me'),
      ),
    )

    const btn = container.querySelector<HTMLButtonElement>('#fcb')!
    expect(btn).toBeTruthy()

    // Real focus — bubbling `focusin` must reach the <section>'s onFocusIn.
    btn.focus()
    expect(document.activeElement).toBe(btn)
    expect(onIn).toHaveBeenCalledTimes(1)
    expect(onOut).not.toHaveBeenCalled()

    // Real blur — bubbling `focusout`.
    btn.blur()
    expect(onOut).toHaveBeenCalledTimes(1)
    expect(onIn).toHaveBeenCalledTimes(1)

    unmount()
  })
})
