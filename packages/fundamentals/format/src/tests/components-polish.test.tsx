import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { renderToString } from '@pyreon/runtime-server'
import { DateTime, Num } from '../components'
import { currencyFormatter, dateFormatter, setLocale } from '../index'
import { resetLocaleState } from '../locale'

afterEach(() => resetLocaleState())

function render(vnode: unknown) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const unmount = mount(vnode as never, root)

  return { root, done: () => { unmount(); root.remove() } }
}

describe('<DateTime> title: the exact date and time on hover', () => {
  it('a calendar date: the full date, no zone', () => {
    const { root, done } = render(h(DateTime, { value: '2026-11-18', kind: 'date', locale: 'en-US', format: 'short' }))
    const t = root.querySelector('time')!
    expect(t.textContent).toBe('11/18/26')
    expect(t.getAttribute('title')).toBe('Wednesday, November 18, 2026')
    done()
  })

  it('an instant: the full date and the time with its zone name, in the displayed zone', () => {
    const at = Date.UTC(2026, 10, 18, 23, 30)
    const { root, done } = render(h(DateTime, { value: at, locale: 'en-US', timeZone: 'Asia/Tokyo', format: 'short' }))
    expect(root.querySelector('time')!.getAttribute('title')).toBe(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'long', timeZone: 'Asia/Tokyo' }).format(at),
    )
    expect(root.querySelector('time')!.getAttribute('title')).toMatch(/GMT\+9|JST/)
    done()
  })

  it('a wall-clock date-time: the full date and the time, no zone', () => {
    const { root, done } = render(h(DateTime, { value: '2026-11-18T14:30', locale: 'en-US' }))
    expect(root.querySelector('time')!.getAttribute('title')).toBe('Wednesday, November 18, 2026 at 2:30:00 PM')
    done()
  })

  it('a time of day', () => {
    const { root, done } = render(h(DateTime, { value: '14:30', kind: 'time', locale: 'en-US' }))
    expect(root.querySelector('time')!.getAttribute('title')).toBe('2:30:00 PM')
    done()
  })

  it('uses the formatter\'s locale and zone, and the active locale otherwise', () => {
    const f = dateFormatter({ locale: 'de', dateStyle: 'short', timeZone: 'UTC' })
    const { root, done } = render(h(DateTime, { value: Date.UTC(2026, 10, 18, 12), format: f }))
    expect(root.querySelector('time')!.getAttribute('title')).toBe(new Intl.DateTimeFormat('de', { dateStyle: 'full', timeStyle: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 18, 12)))
    done()
    setLocale('cs')
    const { root: r2, done: d2 } = render(h(DateTime, { value: '2026-11-18' }))
    expect(r2.querySelector('time')!.getAttribute('title')).toBe(new Intl.DateTimeFormat('cs', { dateStyle: 'full', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 18)))
    setLocale('de')
    expect(r2.querySelector('time')!.getAttribute('title')).toBe(new Intl.DateTimeFormat('de', { dateStyle: 'full', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 18)))
    d2()
  })

  it('a title you pass wins', () => {
    const { root, done } = render(h(DateTime, { value: '2026-11-18', title: 'Published', locale: 'en-US' }))
    expect(root.querySelector('time')!.getAttribute('title')).toBe('Published')
    done()
  })

  it('follows the value; an invalid value has no title', () => {
    const v = signal<string | null>('2026-11-18')
    const { root, done } = render(h(DateTime, { get value() { return v() }, locale: 'en-US', fallback: '-' }))
    const t = root.querySelector('time')!
    expect(t.getAttribute('title')).toBe('Wednesday, November 18, 2026')
    v.set('2027-01-02')
    expect(t.getAttribute('title')).toBe('Saturday, January 2, 2027')
    v.set(null)
    expect(t.hasAttribute('title')).toBe(false)
    done()
  })
})

describe('<Num> tabular, isolate and forwarded props', () => {
  it('no extra props: still no wrapper element', () => {
    const { root, done } = render(h('p', null, h(Num, { value: 1234.5, locale: 'en-US' })))
    expect(root.querySelector('span')).toBeNull()
    expect(root.textContent).toBe('1,234.5')
    done()
  })

  it('tabular renders a span with tabular-nums, set once', () => {
    const n = signal(1)
    const { root, done } = render(h('p', null, h(Num, { get value() { return n() }, locale: 'en-US', tabular: true })))
    const span = root.querySelector('span')!
    expect(span.getAttribute('style')).toBe('font-variant-numeric: tabular-nums;')
    const before = span.getAttribute('style')
    n.set(2)
    n.set(3)
    expect(span.textContent).toBe('3')
    expect(span.getAttribute('style')).toBe(before)
    expect(root.querySelector('span')).toBe(span)
    done()
  })

  it('class, id, data attributes and the like are forwarded', () => {
    const { root, done } = render(h(Num, { value: 5, locale: 'en-US', class: 'price', id: 'p1', 'data-x': 'y' }))
    const span = root.querySelector('span')!
    expect(span.className).toBe('price')
    expect(span.id).toBe('p1')
    expect(span.getAttribute('data-x')).toBe('y')
    expect(span.textContent).toBe('5')
    done()
  })

  it('combines with a style string or object you pass', () => {
    const { root, done } = render(h('div', null, h(Num, { value: 1, locale: 'en-US', tabular: true, style: 'color: red' }), h(Num, { value: 1, locale: 'en-US', tabular: true, style: { color: 'blue' } })))
    const spans = [...root.querySelectorAll('span')]
    expect(spans[0]?.getAttribute('style')).toBe('color: red; font-variant-numeric: tabular-nums;')
    expect(spans[1]?.getAttribute('style')).toContain('font-variant-numeric')
    expect(spans[1]?.getAttribute('style')).toContain('color')
    done()
  })

  it('isolate sets unicode-bidi: isolate; both flags together', () => {
    const { root, done } = render(h('p', null, h(Num, { value: 1, locale: 'ar', isolate: true }), h(Num, { value: 1, locale: 'ar', isolate: true, tabular: true })))
    const spans = [...root.querySelectorAll('span')]
    expect(spans[0]?.getAttribute('style')).toBe('unicode-bidi: isolate;')
    expect(spans[1]?.getAttribute('style')).toBe('font-variant-numeric: tabular-nums; unicode-bidi: isolate;')
    done()
  })

  it('works with a formatter and parts inside the span', () => {
    const price = currencyFormatter('EUR', { locale: 'en-US' })
    const { root, done } = render(h(Num, { value: 9.99, format: price, tabular: true, parts: { currency: (t: string) => h('sup', null, t) } }))
    expect(root.querySelector('span > sup')?.textContent).toBe('€')
    expect(root.textContent).toBe('€9.99')
    done()
  })
})

describe('right-to-left locales (ar)', () => {
  it('numbers and dates keep the locale output; the element isolates them from the surrounding text', () => {
    const { root, done } = render(
      h('p', { dir: 'ltr' }, 'Total: ', h(Num, { value: 1234.5, locale: 'ar-EG', isolate: true, kind: 'currency', currency: 'EGP' }), ' on ', h(DateTime, { value: '2026-11-18', kind: 'date', locale: 'ar-EG' })),
    )
    const num = root.querySelector('span')!
    expect(num.textContent).toBe(new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(1234.5))
    expect(num.getAttribute('style')).toContain('unicode-bidi: isolate')
    const time = root.querySelector('time')!
    expect(time.textContent).toBe(new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 18)))
    expect(time.getAttribute('style')).toContain('unicode-bidi: isolate')
    done()
  })

  it('<DateTime isolate={false}> leaves the element unstyled', () => {
    const { root, done } = render(h(DateTime, { value: '2026-11-18', isolate: false, locale: 'ar' }))
    expect(root.querySelector('time')!.hasAttribute('style')).toBe(false)
    done()
  })

  it('SSR markup carries the same attributes as the client', async () => {
    const tree = () => h('p', null, h(DateTime, { value: '2026-11-18', kind: 'date', locale: 'ar' }), h(Num, { value: 5, locale: 'ar', isolate: true }))
    const html = await renderToString(tree())
    expect(html).toContain('style="unicode-bidi: isolate;"')
    expect(html).toMatch(/<time datetime="2026-11-18" title="[^"]+" style="unicode-bidi: isolate;">/)
  })
})
