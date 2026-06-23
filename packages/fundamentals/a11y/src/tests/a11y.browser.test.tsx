/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium proof that the a11y primitives behave in a true browser —
 * computed styles (VisuallyHidden's clipping), real getComputedStyle, and
 * the live-region announce path that happy-dom can only approximate.
 */
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { VisuallyHidden } from '../visually-hidden'
import { announce, clearAnnouncements } from '../announce'
import { createA11yId } from '../id'

describe('VisuallyHidden (real Chromium)', () => {
  it('clips content out of view but keeps it in the DOM/a11y tree', async () => {
    const { container, unmount } = mountInBrowser(<VisuallyHidden>Search</VisuallyHidden>)
    await flush()
    const el = container.querySelector('span')!
    expect(el).not.toBeNull()
    expect(el.textContent).toBe('Search')
    const cs = getComputedStyle(el)
    expect(cs.position).toBe('absolute')
    expect(cs.width).toBe('1px')
    expect(cs.height).toBe('1px')
    // not display:none — it stays rendered (1px box), so SRs read it
    expect(cs.display).not.toBe('none')
    unmount()
  })

  it('renders a custom tag and forwards props', async () => {
    const { container, unmount } = mountInBrowser(
      <VisuallyHidden as="div" id="sr-heading">
        Section
      </VisuallyHidden>,
    )
    await flush()
    const el = container.querySelector('#sr-heading') as HTMLElement
    expect(el.tagName).toBe('DIV')
    expect(el.textContent).toBe('Section')
    expect(getComputedStyle(el).position).toBe('absolute')
    unmount()
  })
})

describe('announce (real Chromium)', () => {
  it('writes to a clipped live region', async () => {
    clearAnnouncements()
    announce('Saved')
    const el = document.querySelector<HTMLElement>('[data-pyreon-announcer="polite"]')!
    expect(el.getAttribute('aria-live')).toBe('polite')
    expect(getComputedStyle(el).width).toBe('1px')
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    expect(el.textContent).toBe('Saved')
    clearAnnouncements()
  })
})

describe('createA11yId (real Chromium)', () => {
  it('wires aria-describedby to a real element', async () => {
    function Demo() {
      const id = createA11yId('hint')
      return (
        <div>
          <input aria-describedby={id} data-testid="inp" />
          <span id={id}>Help text</span>
        </div>
      )
    }
    const { container, unmount } = mountInBrowser(<Demo />)
    await flush()
    const input = container.querySelector('[data-testid=inp]') as HTMLElement
    const describedBy = input.getAttribute('aria-describedby')!
    expect(describedBy).toBeTruthy()
    expect(container.querySelector(`#${CSS.escape(describedBy)}`)?.textContent).toBe('Help text')
    unmount()
  })
})
