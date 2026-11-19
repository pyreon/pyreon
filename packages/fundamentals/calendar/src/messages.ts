import type { ViewName } from './views'

/**
 * Every word the calendar says. The defaults come from the platform where it has the word (`Intl.DisplayNames` for "month",
 * "week", "day", "year", `Intl.RelativeTimeFormat` for "today", "last week" and "next week") and from a small table for the
 * rest; a language the table does not have falls back to English placeholders, and symbols where one works ("+3"). Replace
 * any of them with the `messages` option (an object, or a function of the locale that can read your translation signals).
 */
export interface CalendarMessages {
  today: string
  /** The name of the "previous" and "next" buttons for a view: by default the platform's "last month", "next week". */
  previous(view: ViewName): string
  next(view: ViewName): string
  /** The label of every view, for the toolbar's switch. */
  views: Readonly<Record<string, string>>
  /** The words after an all-day event's date in its spoken label, and the all-day row's name. */
  allDay: string
  allDayRow: string
  /** The names of the grids. */
  monthGrid: string
  timeGrid: string
  /** The "+N more" button. */
  more(count: number): string
  /** The summary of a day's events, and the empty state. */
  events(count: number): string
  noEvents: string
  /** Between two times of an event, in its spoken label: "14:00 – 15:00". */
  range(from: string, to: string): string
  /** What the live region says after navigation: "November 2026, month". */
  navigated(title: string, view: string): string
  /** After a selection: the range, already formatted. */
  selected(when: string): string
  /** After a move, a resize, a cancelled drag and a refused change. `when` is already formatted ("Thursday 19 November, 14:00 – 15:00"). */
  moved(title: string, when: string): string
  resized(title: string, when: string): string
  grabbed(title: string): string
  cancelled(title: string): string
  failed(title: string): string
  /** The choices of a recurring event's edit (the app's dialog can use them). */
  recurringScope: Readonly<{ this: string; following: string; all: string }>
}

/** The words the platform has no source for, in the languages the package carries. A language not listed here uses English (and a development warning); `messages` replaces any of them. */
interface Words {
  allDay: string
  agenda: string
  timeline: string
  workWeek: string
  noEvents: string
}

const ENGLISH: Words = { allDay: 'all day', agenda: 'Agenda', timeline: 'Timeline', workWeek: 'Work week', noEvents: 'No events' }

/**
 * Plain, standard interface wording. The ones I am least sure of are the Czech "Agenda", the French "Planning" and the Japanese
 * work week (left in English): a native speaker should check them.
 */
const WORDS: Record<string, Words> = {
  en: ENGLISH,
  cs: { allDay: 'celý den', agenda: 'Agenda', timeline: 'Časová osa', workWeek: 'Pracovní týden', noEvents: 'Žádné události' },
  ar: { allDay: 'طوال اليوم', agenda: 'جدول الأعمال', timeline: 'الجدول الزمني', workWeek: 'أسبوع العمل', noEvents: 'لا توجد أحداث' },
  ja: { allDay: '終日', agenda: '予定リスト', timeline: 'タイムライン', workWeek: ENGLISH.workWeek, noEvents: '予定なし' },
  de: { allDay: 'ganztägig', agenda: 'Agenda', timeline: 'Zeitleiste', workWeek: 'Arbeitswoche', noEvents: 'Keine Termine' },
  fr: { allDay: 'toute la journée', agenda: 'Planning', timeline: 'Chronologie', workWeek: 'Semaine de travail', noEvents: 'Aucun événement' },
  es: { allDay: 'todo el día', agenda: 'Agenda', timeline: 'Cronología', workWeek: 'Semana laboral', noEvents: 'Sin eventos' },
}

/** The built-in words of a language, English when it is not in the table. */
export const wordsOf = (locale: string): Words => WORDS[language(locale)] ?? ENGLISH

/** Is the language in the built-in table? (The platform has no word for "all day" and the like; any other language needs `messages`.) */
export const hasAllDay = (locale: string): boolean => language(locale) in WORDS

const language = (locale: string): string => locale.split(/[-_]/)[0]?.toLowerCase() ?? 'en'

/** Upper-case the first grapheme where the script has case (`toLocaleUpperCase` leaves Arabic, Japanese and the like alone). */
export function capitalise(text: string, locale: string): string {
  if (text === '') return text
  const first = new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(text)[Symbol.iterator]().next().value?.segment ?? (Array.from(text)[0] as string)

  return first.toLocaleUpperCase(locale) + text.slice(first.length)
}

function field(locale: string, name: 'month' | 'weekOfYear' | 'day' | 'year', fallback: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: 'dateTimeField' }).of(name) ?? fallback
  } catch {
    return fallback
  }
}

const UNIT = { month: 'month', year: 'year', agenda: 'week', timeline: 'week', week: 'week', workWeek: 'week', day: 'day', days: 'day' } as const

function relative(locale: string, value: number, unit: 'day' | 'week' | 'month' | 'year'): string {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)
  } catch {
    return value < 0 ? 'Previous' : 'Next'
  }
}

/** The default messages of a locale. */
export function defaultMessages(locale: string): CalendarMessages {
  const lang = language(locale)
  const english = lang === 'en'
  const count = new Intl.NumberFormat(locale)
  // the sign comes from the platform, so its position and the digits are right in the language's own script and direction
  const signed = new Intl.NumberFormat(locale, { signDisplay: 'always' })
  const plural = new Intl.PluralRules(locale)
  const words = wordsOf(locale)
  const allDay = words.allDay
  const month = capitalise(field(locale, 'month', 'month'), locale)
  const week = capitalise(field(locale, 'weekOfYear', 'week'), locale)
  const day = capitalise(field(locale, 'day', 'day'), locale)
  const year = capitalise(field(locale, 'year', 'year'), locale)
  const views = { month, week, day, year, workWeek: words.workWeek, days: 'Days', agenda: words.agenda, timeline: words.timeline }
  const viewName = (view: string): string => (views as Record<string, string>)[view] ?? view
  const when = (view: ViewName, step: number): string => capitalise(relative(locale, step, UNIT[view]), locale)
  const grid = english ? 'Calendar' : capitalise(field(locale, 'month', 'month'), locale)

  return {
    today: capitalise(relative(locale, 0, 'day'), locale),
    previous: (view) => when(view, -1),
    next: (view) => when(view, 1),
    views,
    allDay,
    allDayRow: capitalise(allDay, locale),
    monthGrid: grid,
    timeGrid: english ? 'Calendar, time grid' : `${week}, ${day}`,
    more: (n) => (english ? `${count.format(n)} more` : signed.format(n)),
    events: (n) => (english ? `${n === 0 ? 'no' : count.format(n)} ${plural.select(n) === 'one' ? 'event' : 'events'}` : count.format(n)),
    noEvents: words.noEvents,
    range: (from, to) => `${from} – ${to}`,
    navigated: (title, view) => `${title}, ${viewName(view)}`,
    selected: (text) => (english ? `Selected ${text}` : text),
    moved: (title, text) => (english ? `${title} moved to ${text}` : `${title}: ${text}`),
    resized: (title, text) => (english ? `${title} resized to ${text}` : `${title}: ${text}`),
    grabbed: (title) => (english ? `${title} grabbed. Arrow keys move it, Shift with them resizes, Enter drops it, Escape cancels.` : title),
    cancelled: (title) => (english ? `${title}: change cancelled` : title),
    failed: (title) => (english ? `${title}: the change was not saved` : title),
    recurringScope: { this: 'This event', following: 'This and following events', all: 'All events' },
  }
}
