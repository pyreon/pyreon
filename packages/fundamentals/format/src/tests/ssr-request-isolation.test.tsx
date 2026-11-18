// @vitest-environment node
/**
 * Per-request isolation on the server. `provideLocale` writes to the
 * request-scoped context stack (never to module state), and `setLocale` is a
 * warned no-op there, so two interleaved renders can never see each other's
 * locale or time zone.
 *
 * NODE environment deliberately: under happy-dom `isServer` is false and the
 * request-context stack provider is not the one this test needs.
 */
import { h } from '@pyreon/core'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import * as format from '../index'
import { _resetLocaleState } from '../locale'
import { _resetWarnings } from '../warn'

const { formatNumber, formatDate, provideLocale, provideTimeZone } = format

const tick = (ms = 1) => new Promise<void>((r) => setTimeout(r, ms))
const raw = (locale: string) => new Intl.NumberFormat(locale).format(1234567.5)

afterEach(() => _resetLocaleState())

describe('request isolation (server)', () => {
  it('two interleaved request scopes never see each other\'s locale', async () => {
    const request = (tag: string, delay: number) =>
      runWithRequestContext(async () => {
        provideLocale(tag)
        const before = formatNumber(1234567.5)
        await tick(delay)
        const mid = formatNumber(1234567.5)
        await tick(delay)
        return [before, mid, formatNumber(1234567.5)]
      })
    const [a, b, c] = await Promise.all([request('de', 5), request('cs', 1), request('ja', 3)])
    expect(a).toEqual([raw('de'), raw('de'), raw('de')])
    expect(b).toEqual([raw('cs'), raw('cs'), raw('cs')])
    expect(c).toEqual([raw('ja'), raw('ja'), raw('ja')])
    expect(new Set([raw('de'), raw('cs'), raw('ja')]).size).toBeGreaterThan(1)
  })

  it('a request that never provides a locale gets the runtime default, not the previous request\'s', async () => {
    await runWithRequestContext(async () => {
      provideLocale('de')
      await tick()
      expect(formatNumber(1234567.5)).toBe(raw('de'))
    })
    await runWithRequestContext(async () => {
      expect(formatNumber(1234567.5)).toBe(new Intl.NumberFormat(format.locale()).format(1234567.5))
      expect(format.locale()).not.toBe('de')
    })
  })

  it('time zones are isolated too', async () => {
    const at = Date.UTC(2026, 10, 18, 23, 30)
    const zoned = (zone: string, delay: number) =>
      runWithRequestContext(async () => {
        provideTimeZone(zone)
        await tick(delay)
        return formatDate(at, { locale: 'en-US', dateStyle: 'short' })
      })
    const [tokyo, la] = await Promise.all([zoned('Asia/Tokyo', 4), zoned('America/Los_Angeles', 1)])
    expect(tokyo).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: 'Asia/Tokyo' }).format(at))
    expect(la).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: 'America/Los_Angeles' }).format(at))
    expect(tokyo).not.toBe(la)
  })

  it('two concurrent renderToString calls with different provided locales render their own', async () => {
    const App = (props: { tag: string }) => {
      provideLocale(props.tag)
      return h('p', null, () => formatNumber(1234567.5))
    }
    const html = await Promise.all(['de', 'cs', 'en-US', 'fr'].map((tag) => runWithRequestContext(() => renderToString(h(App, { tag })))))
    const text = html.map((h) => h.replace(/<\/?p>/g, '').replace(/&nbsp;|&#160;/g, '\u00a0'))
    expect(text).toEqual(['de', 'cs', 'en-US', 'fr'].map(raw))
  })

  it('setLocale / setTimeZone are no-ops with a dev warning on the server', () => {
    _resetWarnings()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    format.setLocale('de')
    format.setTimeZone('Asia/Tokyo')
    expect(format.locale()).not.toBe('de')
    expect(format.timeZone()).not.toBe('Asia/Tokyo')
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining('setLocale() does nothing on the server'),
      expect.stringContaining('setTimeZone() does nothing on the server'),
    ])
    warn.mockRestore()
  })
})
