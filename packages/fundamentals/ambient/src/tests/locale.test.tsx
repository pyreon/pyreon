import type { VNodeChild } from '@pyreon/core'
import { h, popContext } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { _resetLocaleState } from '../locale'
import { locale, provideLocale, provideTimeZone, setLocale, setTimeZone, timeZone } from '../index'
import { _resetWarnings } from '../warn'

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

describe('locale and time zone: the behaviour @pyreon/format shipped, carried over', () => {
  it('resolution: provide beats setLocale beats the runtime default', () => {
    const runtime = locale()

    setLocale('en-US')
    expect(locale()).toBe('en-US')
    const Scoped = () => {
      provideLocale('de')
      return h('span', null, () => locale())
    }
    const { root, done } = render(h(Scoped, null))

    expect(root.textContent).toBe('de')
    done()
    expect(runtime.length).toBeGreaterThan(0)
  })

  it('setLocale and setTimeZone canonicalise, and are reactive for effects', () => {
    const seen: string[] = []
    const stop = effect(() => {
      seen.push(`${locale()}|${timeZone()}`)
    })

    setLocale('cs-cz')
    setTimeZone('Asia/Tokyo')
    expect(seen.at(-1)).toBe('cs-CZ|Asia/Tokyo')
    expect(seen.length).toBeGreaterThanOrEqual(3)
    stop.dispose()
  })

  it('provideLocale(() => signal()) is the seam @pyreon/i18n calls: it tracks the signal', () => {
    const active = signal('en-US')
    const Provider = (props: { children?: VNodeChild }) => {
      provideLocale(() => active())
      return props.children as VNodeChild
    }
    const Probe = () => h('span', null, () => locale())
    const { root, done } = render(h(Provider, null, h(Probe, null)))

    expect(root.textContent).toBe('en-US')
    active.set('de')
    expect(root.textContent).toBe('de')
    done()
  })

  it('inside an effect created in the provider scope, the provided accessor is tracked', () => {
    const active = signal('en-US')
    const seen: string[] = []
    const Probe = () => {
      effect(() => {
        seen.push(locale())
      })

      return h('i', null)
    }
    const Provider = () => {
      provideLocale(() => active())
      return h(Probe, null)
    }
    const { done } = render(h(Provider, null))

    active.set('cs')
    expect(seen).toEqual(['en-US', 'cs'])
    done()
  })

  it('nested providers: the nearest wins; siblings keep the app default', () => {
    setLocale('en-US')
    const Inner = () => {
      provideLocale('cs')
      return h('span', null, () => locale())
    }
    const Outer = () => {
      provideLocale('de')
      return h('div', null, h('b', null, () => locale()), h(Inner, null))
    }
    const { root, done } = render(h('div', null, h(Outer, null), h(() => h('i', null, () => locale()), null)))

    expect(root.querySelector('b')?.textContent).toBe('de')
    expect(root.querySelector('span')?.textContent).toBe('cs')
    expect(root.querySelector('i')?.textContent).toBe('en-US')
    done()
  })

  it('provideTimeZone scopes zones and tracks an accessor', () => {
    const zone = signal('UTC')
    const Scoped = () => {
      provideTimeZone(() => zone())
      return h('span', null, () => timeZone())
    }
    const { root, done } = render(h(Scoped, null))

    expect(root.textContent).toBe('UTC')
    zone.set('Asia/Tokyo')
    expect(root.textContent).toBe('Asia/Tokyo')
    done()
  })

  it('validates static tags and zones with [Pyreon] errors that say how to fix them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => provideLocale('en_US')).toThrow(/\[Pyreon\] provideLocale\(\): "en_US" is not a valid BCP 47/)
    expect(() => setLocale('en_US')).toThrow(/\[Pyreon\] setLocale\(\)/)
    expect(() => provideTimeZone('Nope/Zone')).toThrow(/\[Pyreon\] provideTimeZone\(\): .*IANA/)
    expect(() => setTimeZone('Nope/Zone')).toThrow(/\[Pyreon\] setTimeZone\(\)/)
    warn.mockRestore()
  })

  it('warns in dev when provideLocale is called outside a component, once', () => {
    _resetWarnings()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    provideLocale('de')
    provideLocale('cs')
    expect(warn.mock.calls.filter((c) => /outside a component/.test(String(c[0])))).toHaveLength(1)
    popContext()
    popContext()
    warn.mockRestore()
  })

  it('the runtime default time zone is a real IANA name', () => {
    expect(() => new Intl.DateTimeFormat(undefined, { timeZone: timeZone() })).not.toThrow()
  })
})
