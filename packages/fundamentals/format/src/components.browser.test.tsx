// Real Chromium. `renderToString` cannot run in the page (runtime-server imports
// node:async_hooks), so the server-shaped markup is produced by a client mount
// into a detached element and then hydrated, as the charts suite does. The
// Node-side half (server HTML equals client HTML in one engine) is
// `tests/ssr-components.test.tsx`.
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { hydrateRoot, mount, onHydrationMismatch } from '@pyreon/runtime-dom'
import { DateTime, Num } from './components'
import { currencyFormatter, dateFormatter, formatBytes, formatDate, formatNumber, provideLocale, setLocale } from './index'

const tree = () =>
  h(
    'main',
    null,
    h(Num, { value: 1234567.5, locale: 'de' }),
    h(Num, { value: 9.99, kind: 'currency', currency: 'EUR', locale: 'cs' }),
    h(DateTime, { value: '2026-11-18', kind: 'date', locale: 'fr' }),
    h(DateTime, { value: Date.UTC(2026, 10, 18, 23, 30), locale: 'ja', timeZone: 'Asia/Tokyo' }),
  )

describe('formatting in a real browser', () => {
  it('matches Chromium\'s own Intl for the same locale', () => {
    expect(formatNumber(1234567.5, { locale: 'de' })).toBe(new Intl.NumberFormat('de').format(1234567.5))
    expect(formatBytes(1536, { locale: 'en-US' })).toBe('1.5 kB')
    expect(formatDate('2026-11-18', { locale: 'en-US', timeZone: 'Pacific/Kiritimati' })).toBe('Nov 18, 2026')
  })

  it('server-shaped markup hydrates with no mismatch; text and <time> nodes are adopted', async () => {
    const scratch = document.createElement('div')
    document.body.appendChild(scratch)
    const unmount = mount(tree() as never, scratch)
    const html = scratch.innerHTML
    unmount()
    scratch.remove()
    expect(html).toContain('<time datetime="2026-11-18"')

    const el = document.createElement('div')
    document.body.appendChild(el)
    el.innerHTML = html
    const timesBefore = [...el.querySelectorAll('time')]
    const mismatches: string[] = []
    const off = onHydrationMismatch((info) => mismatches.push(JSON.stringify(info)))
    const cleanup = hydrateRoot(el, tree() as never)
    off()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(mismatches, 'hydration mismatches').toEqual([])
    expect([...el.querySelectorAll('time')], 'the server <time> elements were replaced').toEqual(timesBefore)
    expect(el.innerHTML).toBe(html)
    cleanup()
    el.remove()
  })

  it('updates in place after hydration when the locale changes', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    setLocale('en-US')
    const n = signal(1234.5)
    const unmount = mount(
      h('p', null, h(Num, { get value() { return n() } }), h(DateTime, { value: '2026-11-18', kind: 'date' })) as never,
      root,
    )
    const time = root.querySelector('time')!
    expect(root.textContent).toContain('1,234.5')
    setLocale('de')
    expect(root.textContent).toContain('1.234,5')
    expect(root.querySelector('time')).toBe(time)
    expect(time.textContent).toBe(new Intl.DateTimeFormat('de', { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 18)))
    n.set(7)
    expect(root.textContent).toContain('7')
    unmount()
    root.remove()
  })

  it('formatter + parts markup hydrates with no mismatch (wrapped parts, adjacent text coalesced)', async () => {
    const price = currencyFormatter('EUR', { locale: 'de' })
    const day = dateFormatter({ locale: 'en-US', dateStyle: 'long' })
    const sup = (t: string) => h('sup', null, t)
    const b = (t: string) => h('b', null, t)
    const tree = () =>
      h('main', null, h(Num, { value: 1234.5, format: price, parts: { currency: sup } }), h(DateTime, { value: '2026-11-18', format: day, parts: { month: b } }))
    const scratch = document.createElement('div')
    document.body.appendChild(scratch)
    const unmount = mount(tree() as never, scratch)
    const html = scratch.innerHTML
    unmount()
    scratch.remove()
    expect(html).toContain('<sup>')
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.innerHTML = html
    const sups = [...el.querySelectorAll('sup, b')]
    const mismatches: string[] = []
    const off = onHydrationMismatch((info) => mismatches.push(JSON.stringify(info)))
    const cleanup = hydrateRoot(el, tree() as never)
    off()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(mismatches, 'hydration mismatches').toEqual([])
    expect([...el.querySelectorAll('sup, b')], 'wrapped nodes were replaced').toEqual(sups)
    expect(el.textContent).toBe(`${new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR' }).format(1234.5)}${new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 18))}`)
    cleanup()
    el.remove()
  })

  it('provideLocale scopes a subtree in the browser', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const Scoped = () => {
      provideLocale('cs')
      return h('span', null, h(Num, { value: 1234567.5 }))
    }
    const unmount = mount(h('div', null, h(Scoped, null)) as never, root)
    expect(root.textContent).toBe(new Intl.NumberFormat('cs').format(1234567.5))
    unmount()
    root.remove()
  })
})
