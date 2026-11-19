// @vitest-environment node
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { Calendar } from '../components'
import { createCalendar } from '../index'

const events = [
  { id: 'Design review', title: 'Design review', start: '2026-11-18T14:00', end: '2026-11-18T15:00' },
  { id: 'Conference', title: 'Conference', start: '2026-11-16', end: '2026-11-19' },
] as never

const NOW = Date.UTC(2026, 10, 18, 11, 0)

describe('the views render on the server', () => {
  const render = (view: 'month' | 'week'): Promise<string> =>
    renderToString(h(Calendar as never, { calendar: createCalendar({ events: () => events, date: '2026-11-18', view, now: () => NOW, timeZone: () => 'Europe/Prague', locale: () => 'en-GB' }) }))

  it('a month for a date, zone and locale: the grid, the events, today, and the same markup every time', async () => {
    expect(typeof document).toBe('undefined')
    const html = await render('month')
    expect(html).toContain('role="grid"')
    expect(html).toContain('Calendar, November 2026')
    expect(html).toContain('aria-current="date"')
    expect(html).toContain('Design review, Wednesday 18 November, 14:00 to 15:00')
    expect(html).toContain('Conference, Monday 16 November to Wednesday 18 November, all day')
    expect(await render('month')).toBe(html)
  })

  it('a week with the now line at the instant it was given, and no document access', async () => {
    const html = await render('week')
    expect(html).toContain('pcal-now')
    expect(html).toContain('data-minute="720"')
    expect(html.match(/class="pcal-slot"/g)).toHaveLength(48 * 7)
    expect(await render('week')).toBe(html)
  })
})
