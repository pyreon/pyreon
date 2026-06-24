/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for FileUploadBase's drop-zone accessibility. The drop
 * zone shipped with only drag/drop handlers — no role, no accessible name, no
 * keyboard activation, so a keyboard / screen-reader user could neither find
 * nor operate it. `dropZoneProps` now carries the WAI-ARIA button pattern:
 * role="button", a focusable tabIndex, aria-label, reactive aria-disabled /
 * aria-busy, and click + Enter/Space activation that opens the native picker.
 *
 * The picker open is verified by spying on the hidden input's `click` (so no
 * real file dialog is summoned in headless Chromium). The package's browser
 * config uses plain oxc JSX (no reactive-prop compiler), so the getter-backed
 * ARIA values are snapshotted at spread time — each disabled/busy variant is a
 * separate mount, which is exactly what we assert.
 *
 * Bisect: remove `onKeyDown` from dropZoneProps → the Enter/Space specs fail
 * (no picker click); remove `role`/`aria-label` → the semantics specs fail.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { FileUploadBase, type FileUploadBaseProps, type FileUploadState } from './FileUploadBase'

function mountUpload(props: Partial<FileUploadBaseProps> = {}) {
  const clicks: string[] = []
  const { container, unmount } = mountInBrowser(
    h(FileUploadBase as never, {
      ...props,
      children: (state: FileUploadState) =>
        h(
          'div',
          null,
          h('div', { ...state.dropZoneProps, id: 'zone' }, 'Drop files'),
          h('input', { ...state.inputProps, ref: state.inputRef, id: 'fileinput' }),
        ),
    }),
  )
  const input = container.querySelector('#fileinput') as HTMLInputElement
  // Spy on the programmatic picker-open so no real file dialog opens headless.
  input.click = () => {
    clicks.push('click')
  }
  return {
    container,
    unmount,
    clicks,
    zone: () => container.querySelector('#zone') as HTMLElement,
  }
}

function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('FileUploadBase — drop-zone accessibility', () => {
  it('exposes the WAI-ARIA button semantics on an enabled zone', async () => {
    const { zone, unmount } = mountUpload()
    await flush()
    const z = zone()
    expect(z.getAttribute('role')).toBe('button')
    expect(z.tabIndex).toBe(0)
    expect(z.getAttribute('aria-label')).toMatch(/upload files/i)
    expect(z.getAttribute('aria-disabled')).toBeNull()
    expect(z.getAttribute('aria-busy')).toBeNull()
    unmount()
  })

  it('honours a custom label', async () => {
    const { zone, unmount } = mountUpload({ label: 'Attach your résumé' })
    await flush()
    expect(zone().getAttribute('aria-label')).toBe('Attach your résumé')
    unmount()
  })

  it('reflects disabled state (tabIndex -1 + aria-disabled)', async () => {
    const { zone, unmount } = mountUpload({ disabled: true })
    await flush()
    expect(zone().tabIndex).toBe(-1)
    expect(zone().getAttribute('aria-disabled')).toBe('true')
    unmount()
  })

  it('reflects busy state (aria-busy)', async () => {
    const { zone, unmount } = mountUpload({ busy: true })
    await flush()
    expect(zone().getAttribute('aria-busy')).toBe('true')
    unmount()
  })

  it('opens the picker on click', async () => {
    const { zone, clicks, unmount } = mountUpload()
    await flush()
    zone().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(clicks).toEqual(['click'])
    unmount()
  })

  it('opens the picker on Enter and Space', async () => {
    const { zone, clicks, unmount } = mountUpload()
    await flush()
    press(zone(), 'Enter')
    press(zone(), ' ')
    expect(clicks).toEqual(['click', 'click'])
    unmount()
  })

  it('preventDefaults Space so the page does not scroll', async () => {
    const { zone, unmount } = mountUpload()
    await flush()
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    zone().dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    unmount()
  })

  it('does not open the picker via keyboard or click when disabled', async () => {
    const { zone, clicks, unmount } = mountUpload({ disabled: true })
    await flush()
    press(zone(), 'Enter')
    zone().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(clicks).toEqual([])
    unmount()
  })
})
