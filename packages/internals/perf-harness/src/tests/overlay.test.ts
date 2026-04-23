// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _count, _disable, _enable, _reset } from '../counters'
import { mountOverlay } from '../overlay'

beforeEach(() => {
  _reset()
  _enable()
})

afterEach(() => {
  // Tear down any overlay left mounted by a previous test.
  const w = globalThis as unknown as { __pyreon_perf_overlay__?: { destroy: () => void } }
  w.__pyreon_perf_overlay__?.destroy()
  _reset()
  _disable()
  document.body.innerHTML = ''
})

describe('mountOverlay', () => {
  it('attaches a shadow root host to document.body', () => {
    const handle = mountOverlay()
    const host = document.querySelector('[data-pyreon-perf-overlay-host]')
    expect(host).toBeTruthy()
    expect(host?.shadowRoot).toBeTruthy()
    handle.destroy()
    expect(document.querySelector('[data-pyreon-perf-overlay-host]')).toBeNull()
  })

  it('renders counters sorted by value descending', async () => {
    _count('runtime.mount', 5)
    _count('styler.resolve', 12)
    _count('router.navigate', 1)
    const handle = mountOverlay()

    // Let rAF-driven render tick once.
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    const root = (
      document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
    ).shadowRoot!
    const rows = Array.from(root.querySelectorAll('tbody tr'))
    const names = rows.map((r) => r.querySelector('.name')?.textContent)
    expect(names).toEqual(['styler.resolve', 'runtime.mount', 'router.navigate'])
    handle.destroy()
  })

  it('reset button clears counters', async () => {
    _count('styler.resolve', 3)
    const handle = mountOverlay()
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const root = (
      document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
    ).shadowRoot!
    ;(root.querySelector('.btn-reset') as HTMLButtonElement).click()
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    expect(root.querySelectorAll('tbody tr').length).toBe(0)
    expect((root.querySelector('.empty') as HTMLElement).style.display).toBe('block')
    handle.destroy()
  })

  it('close button hides without destroying', async () => {
    const handle = mountOverlay()
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const root = (
      document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
    ).shadowRoot!
    ;(root.querySelector('.btn-close') as HTMLButtonElement).click()
    expect(handle.isVisible()).toBe(false)
    handle.show()
    expect(handle.isVisible()).toBe(true)
    handle.destroy()
  })

  it('ctrl+shift+p toggles visibility', async () => {
    const handle = mountOverlay({ visible: false })
    expect(handle.isVisible()).toBe(false)
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true }),
    )
    expect(handle.isVisible()).toBe(true)
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true }),
    )
    expect(handle.isVisible()).toBe(false)
    handle.destroy()
  })

  it('filter chips remove unchecked packages from the table', async () => {
    _count('styler.resolve', 3)
    _count('router.navigate', 1)
    const handle = mountOverlay()
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const root = (
      document.querySelector('[data-pyreon-perf-overlay-host]') as HTMLElement
    ).shadowRoot!
    const chips = Array.from(root.querySelectorAll('.chip')) as HTMLButtonElement[]
    const routerChip = chips.find((c) => c.textContent === 'router')!
    routerChip.click()
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const names = Array.from(root.querySelectorAll('tbody tr .name')).map((n) => n.textContent)
    expect(names).toEqual(['styler.resolve'])
    handle.destroy()
  })

  it('calling mountOverlay twice destroys the first instance', () => {
    mountOverlay()
    const first = document.querySelector('[data-pyreon-perf-overlay-host]')
    mountOverlay()
    const hosts = document.querySelectorAll('[data-pyreon-perf-overlay-host]')
    expect(hosts.length).toBe(1)
    expect(hosts[0]).not.toBe(first)
  })
})
