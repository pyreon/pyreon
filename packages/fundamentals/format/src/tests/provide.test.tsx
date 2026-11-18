import type { VNodeChild } from '@pyreon/core'
import { h, popContext } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import * as format from '../index'
import { _resetLocaleState } from '../locale'
import { _resetWarnings } from '../warn'

const { formatNumber, provideLocale, provideTimeZone, setLocale } = format

afterEach(() => _resetLocaleState())

function render(vnode: VNodeChild) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const unmount = mount(vnode as never, root)
  return {
    root,
    done() {
      unmount()
      root.remove()
    },
  }
}

describe('provideLocale', () => {
  it('scopes a subtree to a static tag; siblings keep the app default', () => {
    setLocale('en-US')
    const Scoped = (props: { tag: string }) => {
      provideLocale(props.tag)
      return h('span', null, () => formatNumber(1234567.5))
    }
    const { root, done } = render(
      h('div', null, h(Scoped, { tag: 'de' }), h(Scoped, { tag: 'cs' }), h(() => h('span', null, () => formatNumber(1234567.5)), null)),
    )
    const texts = [...root.querySelectorAll('span')].map((s) => s.textContent)
    expect(texts).toEqual([
      new Intl.NumberFormat('de').format(1234567.5),
      new Intl.NumberFormat('cs').format(1234567.5),
      new Intl.NumberFormat('en-US').format(1234567.5),
    ])
    done()
  })

  it('the seam @pyreon/i18n will call: provideLocale(() => signal()) drives formatting and tracks the signal', () => {
    const active = signal('en-US')
    const Provider = (props: { children?: VNodeChild }) => {
      provideLocale(() => active())
      return props.children as VNodeChild
    }
    const Price = () => h('span', null, () => format.formatCurrency(1234.5, 'EUR'))
    const { root, done } = render(h(Provider, null, h(Price, null)))
    const raw = (l: string) => new Intl.NumberFormat(l, { style: 'currency', currency: 'EUR' }).format(1234.5)
    expect(root.textContent).toBe(raw('en-US'))
    active.set('de')
    expect(root.textContent).toBe(raw('de'))
    active.set('ja')
    expect(root.textContent).toBe(raw('ja'))
    done()
  })

  it('inside an effect created in the provider scope, the provided accessor is tracked', () => {
    const active = signal('en-US')
    const seen: string[] = []
    const Probe = () => {
      effect(() => {
        seen.push(formatNumber(1234.5))
      })
      return h('i', null)
    }
    const Provider = () => {
      provideLocale(() => active())
      return h(Probe, null)
    }
    const { done } = render(h(Provider, null))
    active.set('cs')
    expect(seen).toEqual([new Intl.NumberFormat('en-US').format(1234.5), new Intl.NumberFormat('cs').format(1234.5)])
    done()
  })

  it('an explicit locale beats the provided one and does not subscribe to it', () => {
    const active = signal('en-US')
    let runs = 0
    const Probe = () => {
      effect(() => {
        runs++
        formatNumber(1234.5, { locale: 'fr' })
      })
      return h('i', null)
    }
    const Provider = () => {
      provideLocale(() => active())
      return h(Probe, null)
    }
    const { done } = render(h(Provider, null))
    active.set('cs')
    expect(runs).toBe(1)
    done()
  })

  it('nested providers: the nearest wins', () => {
    const Inner = () => {
      provideLocale('cs')
      return h('span', null, () => formatNumber(1234.5))
    }
    const Outer = () => {
      provideLocale('de')
      return h('div', null, h('b', null, () => formatNumber(1234.5)), h(Inner, null))
    }
    const { root, done } = render(h(Outer, null))
    expect(root.querySelector('b')?.textContent).toBe(new Intl.NumberFormat('de').format(1234.5))
    expect(root.querySelector('span')?.textContent).toBe(new Intl.NumberFormat('cs').format(1234.5))
    done()
  })

  it('a provided locale beats setLocale', () => {
    setLocale('en-US')
    const Scoped = () => {
      provideLocale('de')
      return h('span', null, () => formatNumber(1234.5))
    }
    const { root, done } = render(h(Scoped, null))
    expect(root.textContent).toBe(new Intl.NumberFormat('de').format(1234.5))
    done()
  })

  it('provideTimeZone scopes zones and tracks an accessor', () => {
    const zone = signal('UTC')
    const at = Date.UTC(2026, 10, 18, 23, 30)
    const Scoped = () => {
      provideTimeZone(() => zone())
      return h('span', null, () => format.formatDateTime(at, { locale: 'en-US' }))
    }
    const { root, done } = render(h(Scoped, null))
    const raw = (timeZone: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(at)
    expect(root.textContent).toBe(raw('UTC'))
    zone.set('Asia/Tokyo')
    expect(root.textContent).toBe(raw('Asia/Tokyo'))
    done()
  })

  it('validates static tags and zones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => provideLocale('en_US')).toThrow(/\[Pyreon\] provideLocale\(\): "en_US" is not a valid BCP 47/)
    expect(() => provideTimeZone('Nope/Zone')).toThrow(/\[Pyreon\] provideTimeZone\(\): .*IANA/)
    warn.mockRestore()
  })

  it('warns in dev when called outside a component, once', () => {
    _resetWarnings()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    provideLocale('de')
    provideLocale('cs')
    expect(warn.mock.calls.filter((c) => /outside a component/.test(String(c[0])))).toHaveLength(1)
    popContext()
    popContext()
    warn.mockRestore()
  })
})
