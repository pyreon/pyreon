// @vitest-environment node
/**
 * Per-request isolation on the server. `provideLocale`, `provideTimeZone` and `provideClock` write to the request-scoped
 * context stack (never to module state), and `setLocale` is a warned no-op there, so two interleaved renders can never see
 * each other's locale, zone or clock. NODE environment deliberately: under happy-dom `isServer` is false.
 */
import { h } from '@pyreon/core'
import { effectScope } from '@pyreon/reactivity'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { _resetClockState } from '../clock'
import { _resetLocaleState } from '../locale'
import { clockAttributes, clockScript, locale, now, provideClock, provideLocale, provideTimeZone, setLocale, setTimeZone, timeZone, useNow } from '../index'
import { _resetWarnings } from '../warn'

const tick = (ms = 1) => new Promise<void>((r) => setTimeout(r, ms))

afterEach(() => {
  _resetLocaleState()
  _resetClockState()
})

describe('request isolation (server)', () => {
  it("two interleaved request scopes never see each other's locale", async () => {
    const request = (tag: string, delay: number) =>
      runWithRequestContext(async () => {
        provideLocale(tag)
        const before = locale()

        await tick(delay)
        const mid = locale()

        await tick(delay)

        return [before, mid, locale()]
      })
    const [a, b, c] = await Promise.all([request('de', 5), request('cs', 1), request('ja', 3)])

    expect(a).toEqual(['de', 'de', 'de'])
    expect(b).toEqual(['cs', 'cs', 'cs'])
    expect(c).toEqual(['ja', 'ja', 'ja'])
  })

  it("a request that never provides a locale gets the runtime default, not the previous request's", async () => {
    await runWithRequestContext(async () => {
      provideLocale('de')
      await tick()
      expect(locale()).toBe('de')
    })
    await runWithRequestContext(async () => {
      expect(locale()).not.toBe('de')
    })
  })

  it('time zones are isolated too', async () => {
    const zoned = (zone: string, delay: number) =>
      runWithRequestContext(async () => {
        provideTimeZone(zone)
        await tick(delay)

        return timeZone()
      })

    expect(await Promise.all([zoned('Asia/Tokyo', 4), zoned('America/Los_Angeles', 1)])).toEqual(['Asia/Tokyo', 'America/Los_Angeles'])
  })

  it('provideClock is isolated per request, and the HTML carries the right instant', async () => {
    const A = 1_000_000_000_000
    const B = 1_700_000_000_000
    const request = (instant: number, delay: number) =>
      runWithRequestContext(async () => {
        provideClock(instant)
        await tick(delay)

        return [now(), clockScript(), clockAttributes()] as const
      })
    const [a, b] = await Promise.all([request(A, 5), request(B, 1)])

    expect(a[0]).toBe(A)
    expect(b[0]).toBe(B)
    expect(a[1]).toBe(`<script>window.__PYREON_CLOCK__=${A}</script>`)
    expect(b[2]).toEqual({ 'data-pyreon-clock': String(B) })
  })

  it('concurrent renderToString calls render their own locale and instant', async () => {
    const App = (props: { tag: string; at: number }) => {
      provideLocale(props.tag)
      provideClock(props.at)
      const n = useNow({ every: 'second' })

      return h('p', null, () => `${locale()}@${n()}`)
    }
    const html = await Promise.all(
      [
        ['de', 1000],
        ['cs', 2000],
        ['fr', 3000],
      ].map(([tag, at]) => runWithRequestContext(() => renderToString(h(App, { tag: tag as string, at: at as number })))),
    )

    expect(html.map((x) => x.replace(/<\/?p>/g, ''))).toEqual(['de@1000', 'cs@2000', 'fr@3000'])
  })

  it('setLocale / setTimeZone are no-ops with a dev warning on the server', () => {
    _resetWarnings()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    setLocale('de')
    setTimeZone('Asia/Tokyo')
    expect(locale()).not.toBe('de')
    expect(timeZone()).not.toBe('Asia/Tokyo')
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringContaining('setLocale() does nothing on the server'), expect.stringContaining('setTimeZone() does nothing on the server')])
    warn.mockRestore()
  })

  it('starts no timer on the server: useNow returns the plain read, even with readers', async () => {
    vi.useFakeTimers()
    const App = () => {
      const n = useNow({ every: 'second' })

      return h('p', null, () => String(typeof n()))
    }

    await runWithRequestContext(() => renderToString(h(App, null)))
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('even inside a reactive scope the server starts no timer (a scope on a server is never disposed)', () => {
    vi.useFakeTimers()
    const scope = effectScope()

    scope.runInScope(() => {
      useNow({ every: 'second' })
      useNow({ every: 'day' })
    })
    expect(vi.getTimerCount()).toBe(0)
    scope.stop()
    vi.useRealTimers()
  })
})
