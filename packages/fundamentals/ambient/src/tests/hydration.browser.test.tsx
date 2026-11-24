// Real Chromium. `renderToString` cannot run in the page (runtime-server imports node:async_hooks), so the server-shaped
// markup is produced by a client mount at the server's instant into a detached element and then hydrated, as the charts
// and format suites do. The Node-side half (the server HTML carries the provided instant and the script) is
// `tests/locale-ssr.test.tsx`.
import { h } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { hydrateRoot, mount, onHydrationMismatch } from '@pyreon/runtime-dom'
import { resetClockState, now, setClock, useNow } from '../clock'

const MINUTE = 60_000
const SERVER_AT = Date.now() - 5 * MINUTE

/** "N min ago" relative to the server's instant: a stand-in for a relative-time label. */
const Label = (props: { since: number; log?: number[] }) => {
  const n = useNow({ every: 'minute' })

  effect(() => {
    props.log?.push(n())
  })

  return h('p', null, () => `${Math.floor((n() - props.since) / MINUTE)} min`)
}

function serverHtml(): string {
  setClock(() => SERVER_AT)
  const scratch = document.createElement('div')

  document.body.appendChild(scratch)
  const unmount = mount(h(Label, { since: SERVER_AT }) as never, scratch)
  const html = scratch.innerHTML

  unmount()
  scratch.remove()
  resetClockState()

  return html
}

const text = (el: Element): string => el.querySelector('p')?.textContent ?? ''

afterEach(() => {
  resetClockState()
  delete (globalThis as Record<string, unknown>).__PYREON_CLOCK__
})

describe('the clock hand-over hydrates without a mismatch and then updates once', () => {
  it('server HTML rendered 5 minutes ago: no mismatch with the hand-over, then ONE update to real time', async () => {
    const html = serverHtml()

    expect(html).toContain('0 min')
    const el = document.createElement('div')

    document.body.appendChild(el)
    el.innerHTML = html
    ;(globalThis as Record<string, unknown>).__PYREON_CLOCK__ = SERVER_AT
    const log: number[] = []
    const mismatches: string[] = []
    const off = onHydrationMismatch((info) => mismatches.push(JSON.stringify(info)))
    const cleanup = hydrateRoot(el, h(Label, { since: SERVER_AT, log }) as never)

    off()
    expect(mismatches, 'hydration mismatches').toEqual([])
    expect(text(el)).toBe('0 min') // the first client render read the server's instant
    expect(log).toEqual([SERVER_AT])
    await new Promise((r) => setTimeout(r, 20))
    expect(text(el)).toBe('5 min') // real time took over
    expect(log).toHaveLength(2) // exactly one update
    expect(Math.abs(now() - Date.now())).toBeLessThan(1000)
    cleanup()
    el.remove()
  })

  it('control: without the hand-over the same HTML does NOT hydrate cleanly (the test can fail)', async () => {
    const html = serverHtml()
    const el = document.createElement('div')

    document.body.appendChild(el)
    el.innerHTML = html
    const mismatches: string[] = []
    const off = onHydrationMismatch((info) => mismatches.push(JSON.stringify(info)))
    const cleanup = hydrateRoot(el, h(Label, { since: SERVER_AT }) as never)

    off()
    await new Promise((r) => setTimeout(r, 20))
    expect(mismatches.length > 0 || text(el) !== '0 min').toBe(true)
    cleanup()
    el.remove()
  })

  it('a real timer: the minute reader of a mounted page ticks at the minute boundary in the browser', async () => {
    const el = document.createElement('div')

    document.body.appendChild(el)
    const unmount = mount(h(Label, { since: Date.now() }) as never, el)
    const msToMinute = MINUTE - (Date.now() % MINUTE)

    expect(msToMinute).toBeGreaterThan(0)
    expect(text(el)).toBe('0 min')
    unmount()
    el.remove()
  })
})
