import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { renderToString } from '@pyreon/runtime-server'
import { DateTime, Num, partsToChildren } from '../components'
import { bytesFormatter, currencyFormatter, dateFormatter, dateTimeFormatter, numberFormatter, setLocale } from '../index'
import { _resetLocaleState } from '../locale'

afterEach(() => _resetLocaleState())

function render(vnode: unknown) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const unmount = mount(vnode as never, root)

  return { root, done: () => { unmount(); root.remove() } }
}

/** Markup without the reactive-boundary comment markers (they differ between server and client by design; hydration is covered in the browser test). */
const markup = (html: string): string => html.replace(/<!--.*?-->/g, '')

const sup = (text: string) => h('sup', null, text)

describe('<Num format>', () => {
  it('renders what the formatter returns', () => {
    const price = currencyFormatter('EUR', { locale: 'en-US' })
    const { root, done } = render(h('p', null, h(Num, { value: 9.99, format: price })))
    expect(root.textContent).toBe('€9.99')
    done()
  })

  it('works for every number-style formatter and follows a signal and the locale', () => {
    setLocale('en-US')
    const n = signal(1234.5)
    const f = numberFormatter()
    const { root, done } = render(h('p', null, h(Num, { get value() { return n() }, format: f })))
    expect(root.textContent).toBe('1,234.5')
    n.set(99999)
    expect(root.textContent).toBe('99,999')
    setLocale('de')
    expect(root.textContent).toBe(new Intl.NumberFormat('de').format(99999))
    done()
    const { root: r2, done: d2 } = render(h('p', null, h(Num, { value: 1536, format: bytesFormatter({ locale: 'en-US' }) })))
    expect(r2.textContent).toBe('1.5 kB')
    d2()
  })

  it('parts wrap a part without string surgery', () => {
    const price = currencyFormatter('EUR', { locale: 'en-US' })
    const { root, done } = render(h('p', null, h(Num, { value: 9.99, format: price, parts: { currency: sup } })))
    expect(markup(root.innerHTML)).toBe('<p><sup>€</sup>9.99</p>')
    expect(root.textContent).toBe('€9.99')
    done()
  })

  it('unwrapped parts are joined into one text node (adjacent text nodes would break hydration)', () => {
    const price = currencyFormatter('EUR', { locale: 'en-US' })
    const { root, done } = render(h('p', null, h(Num, { value: 1234.5, format: price, parts: { currency: sup } })))
    expect([...(root.querySelector('p')?.childNodes ?? [])].filter((n) => n.nodeType !== 8)).toHaveLength(2)
    done()
    const { root: r2, done: d2 } = render(h('p', null, h(Num, { value: 1234.5, format: price, parts: { decimal: (t: string) => h('b', null, t), fraction: (t: string) => h('i', null, t) } })))
    expect(markup(r2.innerHTML)).toBe('<p>€1,234<b>.</b><i>50</i></p>')
    d2()
  })

  it('a locale that puts the currency after the number', () => {
    const price = currencyFormatter('EUR', { locale: 'de' })
    const { root, done } = render(h('p', null, h(Num, { value: 9.99, format: price, parts: { currency: sup } })))
    expect(root.textContent).toBe(new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR' }).format(9.99))
    expect(root.querySelector('sup')?.textContent).toBe('€')
    expect(root.innerHTML.indexOf('<sup>')).toBeGreaterThan(root.innerHTML.indexOf('9,99'))
    done()
  })

  it('an invalid or missing value renders the formatter fallback, with parts or without', () => {
    const price = currencyFormatter('EUR', { locale: 'en-US' }).fallback('n/a')
    const { root, done } = render(h('p', null, h(Num, { value: null, format: price }), h('i', null, h(Num, { value: null, format: price, parts: { currency: sup } }))))
    expect(root.querySelector('p')?.firstChild?.textContent).toBe('n/a')
    expect(root.querySelector('i')?.textContent).toBe('n/a')
    done()
  })

  it('kind / currency props still work without a formatter', () => {
    const { root, done } = render(h('p', null, h(Num, { value: 9.99, kind: 'currency', currency: 'EUR', locale: 'en-US' })))
    expect(root.textContent).toBe('€9.99')
    done()
  })

  it('SSR output equals client output', async () => {
    const price = currencyFormatter('EUR', { locale: 'en-US' })
    const tree = () => h('p', null, h(Num, { value: 1234.5, format: price, parts: { currency: sup } }), ' / ', h(Num, { value: 2, format: price }))
    const html = await renderToString(tree())
    const { root, done } = render(tree())
    expect(markup(html)).toBe(markup(root.innerHTML))
    done()
  })
})

describe('<DateTime format={formatter}>', () => {
  it('renders the formatter output inside <time datetime>', () => {
    const f = dateFormatter({ locale: 'en-US', dateStyle: 'long' })
    const { root, done } = render(h(DateTime, { value: '2026-11-18', format: f }))
    expect(root.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-18')
    expect(root.textContent).toBe('November 18, 2026')
    done()
  })

  it('a style string still works as before', () => {
    const { root, done } = render(h(DateTime, { value: '2026-11-18', kind: 'date', format: 'full', locale: 'en-US' }))
    expect(root.textContent).toBe('Wednesday, November 18, 2026')
    done()
  })

  it('parts wrap a part', () => {
    const f = dateFormatter({ locale: 'en-US', dateStyle: 'long' })
    const { root, done } = render(h(DateTime, { value: '2026-11-18', format: f, parts: { month: (t: string) => h('b', null, t) } }))
    expect(markup(root.querySelector('time')?.innerHTML ?? '')).toBe('<b>November</b> 18, 2026')
    done()
  })

  it('follows the value and the active locale', () => {
    setLocale('en-US')
    const v = signal('2026-11-18')
    const f = dateFormatter({ dateStyle: 'medium' })
    const { root, done } = render(h(DateTime, { get value() { return v() }, format: f }))
    expect(root.textContent).toBe('Nov 18, 2026')
    v.set('2027-01-02')
    expect(root.textContent).toBe('Jan 2, 2027')
    setLocale('cs')
    expect(root.textContent).toBe(new Intl.DateTimeFormat('cs', { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(2027, 0, 2)))
    done()
  })

  it('invalid values render the fallback and no datetime', () => {
    const f = dateTimeFormatter({ locale: 'en-US' }).fallback('unknown')
    const { root, done } = render(h(DateTime, { value: 'garbage', format: f, parts: { month: (t: string) => h('b', null, t) } }))
    expect(root.textContent).toBe('unknown')
    expect(root.querySelector('time')?.hasAttribute('datetime')).toBe(false)
    done()
  })

  it('SSR output equals client output', async () => {
    const f = dateFormatter({ locale: 'en-US', dateStyle: 'long' })
    const tree = () => h(DateTime, { value: '2026-11-18', format: f, parts: { month: (t: string) => h('b', null, t) } })
    const html = await renderToString(tree())
    const { root, done } = render(tree())
    expect(markup(html)).toBe(markup(root.innerHTML))
    done()
  })
})

describe('partsToChildren', () => {
  it('coalesces unwrapped runs and ignores inherited keys', () => {
    expect(partsToChildren([{ type: 'a', value: '1' }, { type: 'b', value: '2' }, { type: 'c', value: '3' }], {})).toEqual(['123'])
    expect(partsToChildren([{ type: 'toString', value: 'x' }], {})).toEqual(['x'])
    const out = partsToChildren([{ type: 'a', value: '1' }, { type: 'b', value: '2' }, { type: 'a', value: '3' }], { b: sup })
    expect(out).toHaveLength(3)
  })
})
