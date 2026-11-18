import { guard } from './errors'
import { HOUR, MINUTE, civilFromDays, dayOf, monthOf, yearOf } from './civil'
import { DAILY, HOURLY, YEAR, compile, type Plan } from './plan'
import type { Recurrence } from './types'

/** The phrases `describeRule` assembles. Each value is a template; `{n}`, `{list}`, `{nth}`, `{weekday}` and `{date}` are filled in. */
export interface RuleMessages {
  everyDay: string
  everyNDays: string
  everyWeek: string
  everyNWeeks: string
  everyMonth: string
  everyNMonths: string
  everyYear: string
  everyNYears: string
  everyHour: string
  everyNHours: string
  everyMinute: string
  everyNMinutes: string
  /** `{list}` is the weekday names. */
  onWeekdays: string
  /** `{nth}` and `{weekday}`: one n-th weekday; the entries are joined into the `{list}` of `onWeekdays`. */
  nthWeekday: string
  /** `{list}` is the day numbers. */
  onMonthDays: string
  /** `{list}` is the month names. */
  inMonths: string
  /** `{list}` is the times, `09:00`. */
  atTimes: string
  /** `{date}` is the last day. */
  until: string
  /** `{n}` is the number of occurrences. */
  times: string
  /** `{a}` and `{b}`: how the last two entries of a list are joined. */
  listAnd: string
  /** `{a}` and `{b}`: how earlier entries of a list are joined. */
  listComma: string
  first: string
  second: string
  third: string
  fourth: string
  fifth: string
  last: string
  /** What a rule gets when it has no natural description. */
  custom: string
}

const ENGLISH: RuleMessages = {
  everyDay: 'every day', everyNDays: 'every {n} days', everyWeek: 'every week', everyNWeeks: 'every {n} weeks', everyMonth: 'every month', everyNMonths: 'every {n} months',
  everyYear: 'every year', everyNYears: 'every {n} years', everyHour: 'every hour', everyNHours: 'every {n} hours', everyMinute: 'every minute', everyNMinutes: 'every {n} minutes',
  onWeekdays: 'on {list}', nthWeekday: 'the {nth} {weekday}', onMonthDays: 'on day {list}', inMonths: 'in {list}', atTimes: 'at {list}', until: 'until {date}', times: '{n} times',
  listAnd: '{a} and {b}', listComma: '{a}, {b}', first: 'first', second: 'second', third: 'third', fourth: 'fourth', fifth: 'fifth', last: 'last', custom: 'Custom schedule',
}

const fill = (template: string, values: Record<string, string | number>): string => template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`))

function join(items: string[], m: RuleMessages): string {
  let out = items[0] ?? ''

  for (let i = 1; i < items.length; i++) out = fill(i === items.length - 1 ? m.listAnd : m.listComma, { a: out, b: items[i]! })

  return out
}

const EVERY: [keyof RuleMessages, keyof RuleMessages][] = [
  ['everyYear', 'everyNYears'], ['everyMonth', 'everyNMonths'], ['everyWeek', 'everyNWeeks'], ['everyDay', 'everyNDays'], ['everyHour', 'everyNHours'], ['everyMinute', 'everyNMinutes'],
]

/** A rule that has no natural English sentence: weeks of the year, year days, set positions, mixed day selections. */
function isCustom(plan: Plan): boolean {
  if (plan.weeks !== null || plan.yearDays !== null || plan.position !== null) return true
  if (plan.freq >= HOURLY && (plan.hours !== null || plan.minutes !== null || plan.months !== null || plan.monthDays !== null || plan.weekdays !== null || plan.nth !== null)) return true
  if (plan.monthDays !== null && (plan.weekdays !== null || plan.nth !== null)) return true

  return plan.nth !== null && plan.weekdays !== null
}

function names(locale: string | undefined, kind: 'weekday' | 'month', values: number[]): string[] {
  const f = new Intl.DateTimeFormat(locale, { [kind]: 'long', timeZone: 'UTC' })

  return values.map((v) => f.format(kind === 'weekday' ? Date.UTC(2024, 0, v) : Date.UTC(2000, v - 1, 1)))
}

function daySentence(plan: Plan, locale: string | undefined, m: RuleMessages): string[] {
  const parts: string[] = []
  const ordinal = [m.first, m.second, m.third, m.fourth, m.fifth]

  if (plan.freq === YEAR && plan.months !== null) parts.push(fill(m.inMonths, { list: join(names(locale, 'month', plan.months), m) }))
  if (plan.weekdays !== null) parts.push(fill(m.onWeekdays, { list: join(names(locale, 'weekday', plan.weekdays), m) }))
  if (plan.nth !== null) {
    const each = plan.nth.map((e) => fill(m.nthWeekday, { nth: e.nth === -1 ? m.last : e.nth < 0 ? `${m.last} ${-e.nth}` : (ordinal[e.nth - 1] ?? String(e.nth)), weekday: names(locale, 'weekday', [e.weekday])[0]! }))

    parts.push(fill(m.onWeekdays, { list: join(each, m) }))
  }
  if (plan.monthDays !== null) parts.push(fill(m.onMonthDays, { list: join(plan.monthDays.map((d) => (d < 0 ? (d === -1 ? m.last : `${m.last} ${-d}`) : String(d))), m) }))

  return parts
}

/**
 * A rule in words: "Every 2 weeks on Tuesday", "Every month on the last Friday at 09:00, 10 times". English is built in;
 * weekday and month names come from `Intl` for any `locale`; `messages` replaces any of the ~30 phrases (see `RuleMessages`)
 * so an app can translate through its own i18n. Rules with no natural sentence (weeks of the year, year days, set positions,
 * a weekday list mixed with month days) get the `custom` phrase, "Custom schedule", rather than a wrong sentence. `except`
 * and `also` are not described.
 *
 * @example describeRule({ every: 'week', interval: 2, on: { weekdays: [2] }, start: '2026-11-17' }) // => 'Every 2 weeks on Tuesday'
 * @example describeRule({ every: 'month', on: { weekdays: [{ weekday: 5, nth: -1 }] }, start: '2026-11-27T09:00' }) // => 'Every month on the last Friday at 09:00'
 */
export const describeRule = guard('describeRule', function describeRule(rule: Recurrence, options?: { locale?: string; messages?: Partial<RuleMessages> }): string {
  const plan = compile('describeRule', rule)
  const m: RuleMessages = { ...ENGLISH, ...options?.messages }

  if (isCustom(plan)) return m.custom
  const locale = options?.locale
  const [one, many] = EVERY[plan.freq]!
  const pieces: string[] = [plan.interval === 1 ? m[one] : fill(m[many], { n: plan.interval }), ...daySentence(plan, locale, m)]

  if (!plan.dateOnly && plan.freq <= DAILY) {
    pieces.push(fill(m.atTimes, { list: join(plan.tods.map((t) => `${String(Math.floor(t / HOUR)).padStart(2, '0')}:${String(Math.floor((t % HOUR) / MINUTE)).padStart(2, '0')}`), m) }))
  }
  let text = pieces.join(' ')

  if (plan.until !== Infinity) {
    const c = civilFromDays(Math.floor(plan.until / 86_400_000))
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(Date.UTC(yearOf(c), monthOf(c) - 1, dayOf(c)))

    text += `, ${fill(m.until, { date })}`
  } else if (plan.count !== Infinity) text += `, ${fill(m.times, { n: plan.count })}`

  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
})
