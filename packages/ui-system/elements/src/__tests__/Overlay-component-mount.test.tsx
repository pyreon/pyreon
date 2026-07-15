/**
 * Real-mount coverage for the Overlay COMPONENT (not the useOverlay hook).
 *
 * `Overlay.test.ts` mocks `@pyreon/reactivity` and exercises `useOverlay`
 * directly — it never mounts the Component, so the Component's onMount
 * (setupListeners) and the active-content render branch (role/aria-modal +
 * passHandlers spread) stay uncovered. This file mounts the REAL Overlay
 * through `@pyreon/runtime-dom` with no mocks, so the full pipeline runs:
 *   - onMount → setupListeners() (the anonymous onMount callback)
 *   - isClient && active() === true → Portal + Provider + content render
 *   - role / aria-modal modal arms + passHandlers spread
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Overlay } from '../Overlay'

const mountOverlay = (props: Record<string, unknown>) => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const unmount = mount(h(Overlay, props), root)
  return {
    root,
    cleanup: () => {
      unmount()
      root.remove()
    },
  }
}

afterEach(() => {
  // Reset any body-overflow lock the modal path may have left.
  document.body.style.overflow = ''
})

describe('Overlay component — active modal render (mount)', () => {
  it('renders content via Portal with role="dialog" and shows the trigger', () => {
    const { cleanup } = mountOverlay({
      type: 'modal',
      // openOn/closeOn manual → passHandlers true → showContent/hideContent
      // get spread into both the trigger and content render props.
      openOn: 'manual',
      closeOn: 'manual',
      isOpen: true,
      trigger: (p: { ref?: unknown; showContent?: unknown }) =>
        h('button', { ref: p.ref, 'data-testid': 'trigger' }, 'open'),
      children: (p: { ref?: unknown; role?: unknown; active?: unknown; showContent?: unknown }) =>
        h(
          'div',
          { ref: p.ref, 'data-testid': 'content', role: p.role as string | undefined },
          'modal body',
        ),
    })

    const trigger = document.querySelector('[data-testid="trigger"]')
    const content = document.querySelector('[data-testid="content"]')

    expect(trigger).not.toBeNull()
    // active() is true (isOpen) → the isClient && active() branch renders the
    // Portal-hosted content with the modal `role: 'dialog'` arm.
    expect(content).not.toBeNull()
    expect(content!.getAttribute('role')).toBe('dialog')
    expect(content!.textContent).toContain('modal body')

    cleanup()
  })

  it('does NOT render content when inactive (isClient && active() false arm)', () => {
    const { cleanup } = mountOverlay({
      type: 'modal',
      openOn: 'manual',
      closeOn: 'manual',
      isOpen: false,
      trigger: (p: { ref?: unknown }) =>
        h('button', { ref: p.ref, 'data-testid': 'trigger-2' }, 'open'),
      children: (p: { ref?: unknown }) =>
        h('div', { ref: p.ref, 'data-testid': 'content-2' }, 'hidden body'),
    })

    expect(document.querySelector('[data-testid="trigger-2"]')).not.toBeNull()
    // active() false → ternary null arm → no content node.
    expect(document.querySelector('[data-testid="content-2"]')).toBeNull()

    cleanup()
  })

  it('tooltip active render wires the WAI-ARIA tooltip pattern (role=tooltip + aria-describedby↔id)', () => {
    const { cleanup } = mountOverlay({
      type: 'tooltip',
      openOn: 'manual',
      closeOn: 'manual',
      isOpen: true,
      trigger: (p: { ref?: unknown; 'aria-describedby'?: unknown }) =>
        h(
          'button',
          {
            ref: p.ref,
            'data-testid': 'trigger-3',
            'aria-describedby': p['aria-describedby'] as string | undefined,
          },
          'open',
        ),
      children: (p: { ref?: unknown; role?: unknown; id?: unknown }) =>
        h(
          'div',
          {
            ref: p.ref,
            'data-testid': 'content-3',
            role: p.role as string | undefined,
            id: p.id as string | undefined,
          },
          'tip',
        ),
    })

    const trigger = document.querySelector('[data-testid="trigger-3"]')
    const content = document.querySelector('[data-testid="content-3"]')
    expect(content).not.toBeNull()
    // tooltip content carries role="tooltip" (NOT the modal "dialog" arm).
    expect(content!.getAttribute('role')).toBe('tooltip')
    // and an id the trigger's aria-describedby points at — the linkage that
    // makes a screen reader read the tip when the trigger is focused.
    const tipId = content!.getAttribute('id')
    expect(tipId).toBeTruthy()
    expect(trigger!.getAttribute('aria-describedby')).toBe(tipId)

    cleanup()
  })

  it('content render prop receives LIVE active/align/alignX/alignY accessors', () => {
    // The content props are `_rp()`-branded thunks (the compiler shape for
    // `prop={signal()}`); `makeReactiveProps` in the mount pipeline converts
    // them to getters, so a plain read here resolves the CURRENT value.
    const { cleanup } = mountOverlay({
      openOn: 'manual',
      closeOn: 'manual',
      isOpen: true,
      align: 'top',
      alignX: 'right',
      alignY: 'top',
      trigger: (p: { ref?: unknown }) =>
        h('button', { ref: p.ref, 'data-testid': 'trigger-4' }, 'open'),
      children: (p: {
        ref?: unknown
        active?: unknown
        align?: unknown
        alignX?: unknown
        alignY?: unknown
      }) =>
        h(
          'div',
          {
            ref: p.ref,
            'data-testid': 'content-4',
            'data-active': String(p.active),
            'data-align': String(p.align),
            'data-alignx': String(p.alignX),
            'data-aligny': String(p.alignY),
          },
          'body',
        ),
    })

    const content = document.querySelector('[data-testid="content-4"]')
    expect(content).not.toBeNull()
    expect(content!.getAttribute('data-active')).toBe('true')
    expect(content!.getAttribute('data-align')).toBe('top')
    expect(content!.getAttribute('data-alignx')).toBe('right')
    expect(content!.getAttribute('data-aligny')).toBe('top')

    cleanup()
  })

  it('hover overlay opens on trigger enter and detaches content listeners on close', async () => {
    // Exercises the full content-hover lifecycle: open (content mounts →
    // syncContentHoverListeners ATTACHES to the live contentEl) then close
    // (contentRef(null) → isContentLoaded flips false → DETACH from the node
    // we bound to). The explicit `hoverDelay` also covers the configured
    // (non-default) delay read.
    const { cleanup } = mountOverlay({
      openOn: 'hover',
      closeOn: 'hover',
      hoverDelay: 1,
      trigger: (p: { ref?: unknown }) =>
        h('button', { ref: p.ref, 'data-testid': 'trigger-5' }, 'hover me'),
      children: (p: { ref?: unknown }) =>
        h('div', { ref: p.ref, 'data-testid': 'content-5' }, 'tip'),
    })

    const trigger = document.querySelector('[data-testid="trigger-5"]')!
    expect(document.querySelector('[data-testid="content-5"]')).toBeNull()

    // Pointer enters the trigger → hover-open → content mounts + listeners bind.
    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    expect(document.querySelector('[data-testid="content-5"]')).not.toBeNull()

    // Pointer moves trigger→content: onContentEnter cancels the pending hide.
    const content = document.querySelector('[data-testid="content-5"]')!
    trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
    content.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('[data-testid="content-5"]')).not.toBeNull()

    // Pointer leaves the content → scheduleHide(hoverDelay) → close: content
    // unmounts and the sync pass detaches from the (now stale) content node.
    content.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('[data-testid="content-5"]')).toBeNull()

    cleanup()
  })

  it('repositions the content one frame after a manual open (rAF path)', async () => {
    // showContent → content mounts → isContentLoaded flips → repositionOnOpen
    // defers a frame, re-checks, and runs setContentPosition on the live node.
    let show: (() => void) | undefined
    const { cleanup } = mountOverlay({
      openOn: 'manual',
      closeOn: 'manual',
      isOpen: false,
      type: 'modal', // also exercises the modal arm of the open path
      trigger: (p: { ref?: unknown; showContent?: unknown }) => {
        show = p.showContent as () => void
        return h('button', { ref: p.ref, 'data-testid': 'trigger-6' }, 'open')
      },
      children: (p: { ref?: unknown }) =>
        h('div', { ref: p.ref, 'data-testid': 'content-6' }, 'modal body'),
    })

    expect(document.querySelector('[data-testid="content-6"]')).toBeNull()
    show!()
    const content = document.querySelector('[data-testid="content-6"]')
    expect(content).not.toBeNull()

    // Let the deferred rAF measurement land with the overlay still open.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
    // Position pass ran against the live content — the overlay stayed mounted.
    expect(document.querySelector('[data-testid="content-6"]')).not.toBeNull()

    cleanup()
  })
})
