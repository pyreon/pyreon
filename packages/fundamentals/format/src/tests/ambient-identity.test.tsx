/**
 * One source of truth: the locale, the time zone and the clock are `@pyreon/ambient`'s, shared by `@pyreon/format` and
 * `@pyreon/time`. Setting one through any package changes what the others print. (Behaviour of the values themselves is
 * owned by `@pyreon/ambient`'s tests; `provide.test.tsx`, `ssr-request-isolation.test.tsx` and `reactivity.test.ts` here run
 * unchanged through the re-exports.)
 */
import * as ambient from '@pyreon/ambient'
import { _resetClockState } from '@pyreon/ambient/testing'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import * as time from '@pyreon/time'
import { RelativeTime } from '../components'
import * as format from '../index'
import { _resetLocaleState } from '../locale'
import { relativeFormatter } from '../index'
import { relativeFormatter as coreRelativeFormatter } from '../core'

const T0 = Date.UTC(2026, 10, 18, 12, 0, 0)

afterEach(() => {
  _resetClockState()
  _resetLocaleState()
  vi.useRealTimers()
})

describe('the locale and the time zone are one value', () => {
  it('the exports of @pyreon/format ARE the functions of @pyreon/ambient', () => {
    expect(format.locale).toBe(ambient.locale)
    expect(format.setLocale).toBe(ambient.setLocale)
    expect(format.provideLocale).toBe(ambient.provideLocale)
    expect(format.timeZone).toBe(ambient.timeZone)
    expect(format.setTimeZone).toBe(ambient.setTimeZone)
    expect(format.provideTimeZone).toBe(ambient.provideTimeZone)
  })

  it('setLocale from @pyreon/ambient changes what formatNumber prints, and the other way round', () => {
    expect(format.formatNumber(1234.5)).toBe(new Intl.NumberFormat().format(1234.5))
    ambient.setLocale('de')
    expect(format.formatNumber(1234.5)).toBe('1.234,5')
    expect(ambient.locale()).toBe('de')
    format.setLocale('cs')
    expect(ambient.locale()).toBe('cs')
    expect(format.formatNumber(1234.5)).toBe(new Intl.NumberFormat('cs').format(1234.5))
  })

  it('setTimeZone from @pyreon/ambient changes what formatDate prints, and the other way round', () => {
    const instant = Date.UTC(2026, 10, 18, 23, 30)

    ambient.setTimeZone('Asia/Tokyo')
    expect(format.formatDate(instant, { locale: 'en-US' })).toBe('Nov 19, 2026')
    format.setTimeZone('America/Los_Angeles')
    expect(ambient.timeZone()).toBe('America/Los_Angeles')
    expect(format.formatDate(instant, { locale: 'en-US' })).toBe('Nov 18, 2026')
  })

  it('an app with format, time and ambient has one locale, one zone and one clock', () => {
    vi.useFakeTimers({ now: T0 })
    ambient.setLocale('en-US')
    ambient.setTimeZone('Pacific/Kiritimati') // UTC+14: it is already the 19th there
    expect(time.today()).toBe('2026-11-19')
    expect(format.formatDate(ambient.now(), { locale: ambient.locale() })).toBe('Nov 19, 2026')

    // The clock: one pin moves format's relative formatter, time's today(), and ambient's now().
    time.setClock(() => Date.UTC(2026, 10, 20, 12, 0, 0))
    expect(ambient.now()).toBe(Date.UTC(2026, 10, 20, 12, 0, 0))
    expect(time.now()).toBe(ambient.now())
    expect(time.today()).toBe('2026-11-21')
    expect(relativeFormatter({ locale: 'en-US' })('2026-11-19')).toBe('2 days ago')
    ambient.setClock(() => Date.UTC(2026, 10, 18, 12, 0, 0))
    expect(time.today()).toBe('2026-11-19')
    expect(relativeFormatter({ locale: 'en-US' })('2026-11-19')).toBe('today') // a date-only target is a day: the 19th in Kiritimati is today at any hour

    // The locale and zone the other way: format's setters move time's default zone.
    format.setTimeZone('UTC')
    expect(time.today()).toBe('2026-11-18')
    format.setLocale('cs')
    expect(format.formatDate('2026-11-18', 'long')).toBe(new Intl.DateTimeFormat('cs', { dateStyle: 'long', timeZone: 'UTC' }).format(T0))
  })

  it('provideLocale from @pyreon/ambient scopes @pyreon/format inside a component', () => {
    const root = document.createElement('div')
    const Inner = () => h('span', null, () => format.formatNumber(1234.5))
    const Outer = () => {
      ambient.provideLocale('de')

      return h(Inner, null)
    }
    const unmount = mount(h(Outer, null) as never, root)

    expect(root.textContent).toBe('1.234,5')
    unmount()
  })
})

describe('relativeFormatter defaults to the ambient clock in the reactive entry', () => {
  it('without a base it reads now() on every call (non-ticking); with a base the base wins', () => {
    ambient.setClock(() => Date.UTC(2026, 10, 18, 12, 0, 0))
    const since = relativeFormatter({ locale: 'en-US', timeZone: 'UTC' })

    expect(since(Date.UTC(2026, 10, 18, 11, 57, 0))).toBe('3 minutes ago')
    ambient.setClock(() => Date.UTC(2026, 10, 18, 12, 10, 0))
    expect(since(Date.UTC(2026, 10, 18, 11, 57, 0))).toBe('13 minutes ago')
    expect(relativeFormatter({ locale: 'en-US', timeZone: 'UTC', base: '2026-11-17' })('2026-11-18')).toBe('tomorrow')
    // an unset base (with({ base: undefined })) falls back to the clock again
    expect(relativeFormatter({ locale: 'en-US', timeZone: 'UTC', base: '2026-11-17' }).with({ base: undefined })('2026-11-18')).toBe('today')
  })

  it('defineFormats takes the same default', () => {
    ambient.setClock(() => Date.UTC(2026, 10, 18, 12, 0, 0))
    const f = format.defineFormats({ ago: { kind: 'relative', locale: 'en-US', timeZone: 'UTC' } })

    expect(f.ago(Date.UTC(2026, 10, 18, 9, 0, 0))).toBe('3 hours ago')
  })

  it('/core still requires a base: without one every call returns the fallback and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const since = coreRelativeFormatter({ locale: 'en-US', fallback: 'n/a' } as never)

    expect(since('2026-11-17')).toBe('n/a')
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('<RelativeTime> and useRelativeTime read the same pinned clock', () => {
    ambient.setClock(() => Date.UTC(2026, 10, 18, 12, 0, 0))
    const root = document.createElement('div')
    const unmount = mount(h(RelativeTime, { value: Date.UTC(2026, 10, 18, 11, 0, 0), locale: 'en-US', timeZone: 'UTC' }) as never, root)

    expect(root.textContent).toBe('1 hour ago')
    expect(format.useRelativeTime(Date.UTC(2026, 10, 18, 11, 0, 0), { locale: 'en-US', timeZone: 'UTC' })()).toBe('1 hour ago')
    unmount()
  })
})
