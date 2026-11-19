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
    expect(html).toContain('Design review, Wednesday 18 November, 14:00 – 15:00')
    expect(html).toContain('Conference, Monday 16 November – Wednesday 18 November, all day')
    expect(await render('month')).toBe(html)
  })

  it('a week with the now line at the instant it was given, and no document access', async () => {
    const html = await render('week')
    expect(html).toContain('pcal-now')
    expect(html).toContain('data-minute="720"')
    expect(html.match(/class="pcal-slot"/g)).toHaveLength(48 * 7)
    expect(await render('week')).toBe(html)
  })

  it('built-in text follows the locale: no English word of the defaults is left in the toolbar, the cells or the gutter', async () => {
    const english = ['Today', 'Month', 'Week', 'Day', 'Previous', 'Next', 'more', 'last month', 'next month', 'Calendar']
    for (const locale of ['ar', 'cs', 'ja']) {
      for (const view of ['month', 'week'] as const) {
        const calendar = createCalendar({ events: () => [], date: '2026-11-18', view, now: () => NOW, timeZone: () => 'UTC', locale: () => locale })
        const html = await renderToString(h(Calendar as never, { calendar }))
        const text = html.replace(/<[^>]*aria-live[^>]*>.*?<\/output>/g, '')
        for (const word of english) expect(text, `${locale} ${view} has "${word}"`).not.toMatch(new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`))
        expect(text).toContain(calendar.messages().today)
        expect(calendar.messages().today).not.toBe('Today')
      }
    }
  })

  it('the messages option replaces any word, as an object or a function of the locale, and numbers use the locale', () => {
    const calendar = createCalendar({ events: () => [], date: '2026-11-18', locale: () => 'cs', messages: (locale) => ({ today: `dnes-${locale}` }) })
    expect(calendar.messages().today).toBe('dnes-cs')
    expect(calendar.messages().more(3)).toBe('+3')
    const arabic = createCalendar({ events: () => [], date: '2026-11-18', locale: () => 'ar-EG' })
    expect(arabic.messages().more(3)).toBe('\u061C+٣')
    expect(createCalendar({ events: () => [], date: '2026-11-18', locale: () => 'en-GB' }).messages().more(3)).toBe('3 more')
  })
})
