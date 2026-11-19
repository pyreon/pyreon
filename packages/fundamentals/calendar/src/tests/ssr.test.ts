// @vitest-environment node
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { Calendar } from '../components'
import { createCalendar, defaultMessages } from '../index'

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

  it('every view, in the seven languages: no English default word is left in what is drawn (unless the language\'s own word is the same)', async () => {
    const en = defaultMessages('en')
    const loose = { id: 'loose', title: 'Loose', start: '2026-11-18T10:00', end: '2026-11-18T11:00' } as never
    const placed = { id: 'placed', title: 'Placed', start: '2026-11-18T10:00', end: '2026-11-18T11:00', resourceId: 'r1' } as never
    for (const locale of ['cs', 'ar', 'ja', 'de', 'fr', 'es']) {
      const own = defaultMessages(locale)
      const pairs: [string, string][] = [
        ['Today', own.today],
        ['Month', own.views.month as string],
        ['Week', own.views.week as string],
        ['Day', own.views.day as string],
        ['Agenda', own.views.agenda as string],
        ['Timeline', own.views.timeline as string],
        ['No events', own.noEvents],
        ['Unassigned', own.unassigned],
        ['Resource', own.resource],
        ['all day', own.allDay],
        ['Previous', own.previous('week')],
        ['Next', own.next('week')],
      ]
      for (const view of ['month', 'week', 'agenda', 'year', 'timeline'] as const) {
        for (const events of [[], [loose, placed]]) {
          const calendar = createCalendar({ events: () => events, date: '2026-11-18', view, now: () => NOW, timeZone: () => 'UTC', locale: () => locale, resources: () => [{ id: 'r1', title: 'R1' }] })
          const text = (await renderToString(h(Calendar as never, { calendar, views: ['month', 'week', 'day', 'agenda', 'year', 'timeline'] }))).replace(/<[^>]*aria-live[^>]*>.*?<\/output>/g, '')
          for (const [word, translated] of pairs) {
            if (translated === word) continue
            expect(text, `${locale} ${view} shows "${word}"`).not.toMatch(new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`))
          }
        }
      }
    }
    expect(en.views.agenda).toBe('Agenda')
  })

  it('the messages option replaces any word, as an object or a function of the locale, and numbers use the locale', () => {
    const calendar = createCalendar({ events: () => [], date: '2026-11-18', locale: () => 'cs', messages: (locale) => ({ today: `dnes-${locale}` }) })
    expect(calendar.messages().today).toBe('dnes-cs')
    expect(calendar.messages().more(3)).toBe('+3')
    const arabic = createCalendar({ events: () => [], date: '2026-11-18', locale: () => 'ar-EG' })
    expect(arabic.messages().more(3)).toBe('\u061C+٣')
    expect(createCalendar({ events: () => [], date: '2026-11-18', locale: () => 'en-GB' }).messages().more(3)).toBe('3 more')
  })

  it('the built-in table covers the seven languages: no English word of the agenda, the timeline or the empty state is left', () => {
    const english = defaultMessages('en')
    // a word that is the same in a language is not English left behind (the Czech, German and Spanish "Agenda"); the Japanese work week is left in English on purpose
    const same: Record<string, string[]> = { cs: ['agenda'], de: ['agenda'], es: ['agenda'], ja: ['workWeek'] }
    for (const lang of ['cs', 'ar', 'ja', 'de', 'fr', 'es']) {
      const m = defaultMessages(lang)
      for (const key of ['agenda', 'timeline', 'workWeek'] as const) {
        if (same[lang]?.includes(key)) continue
        expect(m.views[key], `${lang} ${key}`).not.toBe(english.views[key])
      }
      expect(m.noEvents, `${lang} noEvents`).not.toBe(english.noEvents)
      expect(m.allDay, `${lang} allDay`).not.toBe(english.allDay)
      for (const key of ['unassigned', 'resource', 'close'] as const) expect(m[key], `${lang} ${key}`).not.toBe(english[key])
    }
    expect(defaultMessages('sw').views.agenda).toBe('Agenda')
  })
})
