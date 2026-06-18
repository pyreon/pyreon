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

  it('non-modal (tooltip) active render omits the dialog role arm', () => {
    const { cleanup } = mountOverlay({
      type: 'tooltip',
      openOn: 'manual',
      closeOn: 'manual',
      isOpen: true,
      trigger: (p: { ref?: unknown }) =>
        h('button', { ref: p.ref, 'data-testid': 'trigger-3' }, 'open'),
      children: (p: { ref?: unknown; role?: unknown }) =>
        h(
          'div',
          { ref: p.ref, 'data-testid': 'content-3', role: p.role as string | undefined },
          'tip',
        ),
    })

    const content = document.querySelector('[data-testid="content-3"]')
    expect(content).not.toBeNull()
    // type !== 'modal' → role is undefined (the false arm of the modal ternary).
    expect(content!.getAttribute('role')).toBeNull()

    cleanup()
  })
})
