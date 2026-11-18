// @vitest-environment node
/**
 * On a server a relative label prints the REQUEST's clock (`provideClock`), never `Date.now()`, starts no timer, and two
 * interleaved requests never see each other's instant. NODE environment deliberately: under happy-dom `isServer` is false.
 */
import { clockAttributes, provideClock, provideLocale, provideTimeZone } from '@pyreon/ambient'
import { _resetClockState, _tickerStats } from '@pyreon/ambient/testing'
import { h } from '@pyreon/core'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { RelativeTime } from '../components'
import { useRelativeTime } from '../index'
import { _resetLocaleState } from '../locale'

const SERVER_AT = Date.UTC(2026, 10, 18, 12, 0, 0)
const MIN = 60_000

afterEach(() => {
  _resetClockState()
  _resetLocaleState()
  vi.useRealTimers()
})

const Page = (props: { at: number; target: number }) => {
  provideClock(props.at)
  provideLocale('en-US')
  provideTimeZone('UTC')
  const ago = useRelativeTime(props.target)

  return h('p', null, h('b', null, ago), h(RelativeTime, { value: props.target }))
}

describe('server render', () => {
  it('prints the provided instant, with <time datetime> and an exact title', async () => {
    const html = await renderToString(h(Page, { at: SERVER_AT, target: SERVER_AT - 5 * MIN }))

    expect(html).toContain('<b>5 minutes ago</b>')
    expect(html).toMatch(/<time datetime="2026-11-18T11:55:00.000Z" title="Wednesday, November 18, 2026[^"]*11:55:00[^"]*"/)
    expect(html).toContain('5 minutes ago</time>')
  })

  it('starts no timer: not a timeout, not a ticker', async () => {
    vi.useFakeTimers({ now: SERVER_AT })
    await renderToString(h(Page, { at: SERVER_AT, target: SERVER_AT - 5 * MIN }))
    expect(vi.getTimerCount()).toBe(0)
    expect(_tickerStats()).toEqual({ active: 0, timers: 0, shared: 0 })
  })

  it('two interleaved requests with different instants never see each other\'s', async () => {
    const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    const request = (at: number, delay: number) =>
      runWithRequestContext(async () => {
        await tick(delay)

        return renderToString(h(Page, { at, target: SERVER_AT - 5 * MIN }))
      })
    const [a, b] = await Promise.all([request(SERVER_AT, 4), request(SERVER_AT + 60 * MIN, 1)])

    expect(a).toContain('<b>5 minutes ago</b>')
    expect(b).toContain('<b>1 hour ago</b>') // 65 minutes: hours from the hour on
  })

  it('emits the hand-over attribute a client reads to hydrate to the same text', () => {
    expect(clockAttributes(SERVER_AT)).toEqual({ 'data-pyreon-clock': String(SERVER_AT) })
  })
})
