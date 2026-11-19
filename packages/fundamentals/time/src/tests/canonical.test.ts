import * as core from '../core'
import * as fp from '../fp'
import type { PlainDateTime, PlainTime, Unit } from '../core'
import * as gen from './rng'
import { int, pick, rng } from './rng'

const UNITS: readonly Unit[] = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond']

/** The canonical form, defined independently of the writer: shortest exact, `HH:MM`, `HH:MM:SS` (seconds non-zero), `.mmm` (non-zero). */
function isCanonical(s: string): boolean {
  const m = /^(?:\d{4}-\d\d-\d\dT)?\d\d:\d\d(?::(\d\d)(?:\.(\d{3}))?)?$/.exec(s)

  if (m === null) return false
  if (m[2] !== undefined) return m[2] !== '000'

  return m[1] === undefined || m[1] !== '00'
}

describe('canonical output: what the package returns is the shortest exact form', () => {
  it('every function that returns a time or a date-time returns its own normal form', () => {
    const r = rng(501)

    for (let i = 0; i < 4000; i++) {
      const dt = gen.dateTime(r) as PlainDateTime
      const time = gen.time(r) as PlainTime
      const t = int(r, Date.UTC(1990, 0, 1), Date.UTC(2040, 0, 1)) + (r() < 0.5 ? 0 : int(r, 0, 999))
      const zone = pick(r, ['UTC', 'Europe/Prague', 'Asia/Kathmandu', 'America/St_Johns'])
      const dur = gen.dateTimeDuration(r)
      const out: string[] = []
      const attempt = (f: () => string): void => {
        try {
          out.push(f())
        } catch {
          // out of range or a rejected value: nothing was returned
        }
      }

      attempt(() => core.add(dt, dur))
      attempt(() => core.subtract(dt, dur))
      attempt(() => core.startOf(dt, pick(r, UNITS)))
      attempt(() => core.endOf(dt, pick(r, UNITS)))
      attempt(() => core.normalize(dt))
      attempt(() => core.normalize(time))
      attempt(() => core.toPlainDateTime(t, zone))
      attempt(() => core.toPlainTime(t, zone))
      attempt(() => core.fromDate(new Date(t), zone))
      attempt(() => fp.add(dur)(dt))
      attempt(() => fp.startOf(pick(r, UNITS))(dt))
      attempt(() => core.parseISO(dt.replace('T', ' ')) ?? '')
      attempt(() => core.plainTime(int(r, 0, 23), int(r, 0, 59), int(r, 0, 59), r() < 0.5 ? 0 : int(r, 0, 999)))
      for (const value of out) {
        expect(isCanonical(value), value).toBe(true)
        expect(core.normalize(value as PlainDateTime), value).toBe(value)
      }
    }
  })

  it('shapes: extra zeros normalise away, and the forms are the ones an <input> produces', () => {
    expect(core.normalize('14:30:00')).toBe('14:30')
    expect(core.normalize('14:30:00.000')).toBe('14:30')
    expect(core.normalize('14:30:05.0')).toBe('14:30:05')
    expect(core.normalize('14:30:05.25')).toBe('14:30:05.250')
    expect(core.normalize('2026-11-18T14:30:00')).toBe('2026-11-18T14:30')
    expect(core.toPlainDateTime(Date.UTC(2026, 10, 18, 13, 30), 'Europe/Prague')).toBe('2026-11-18T14:30')
    expect(core.toPlainDateTime(Date.UTC(2026, 10, 18, 13, 30, 5), 'Europe/Prague')).toBe('2026-11-18T14:30:05')
    expect(core.parseISO('2026-11-18 14:30:00')).toBe('2026-11-18T14:30')
    expect(() => core.normalize('nope' as '10:00')).toThrow(/\[Pyreon\] normalize/)
  })

  it('on canonical values, === and < agree with compare, so plain string sorting is chronological', () => {
    const r = rng(502)

    for (let i = 0; i < 20_000; i++) {
      const a = core.normalize(gen.dateTime(r) as PlainDateTime)
      const b = r() < 0.2 ? a : core.normalize(gen.dateTime(r) as PlainDateTime)
      const c = core.compare(a, b)

      expect(a === b, `${a} ${b}`).toBe(c === 0)
      expect(a < b, `${a} ${b}`).toBe(c < 0)
      const ta = core.normalize(gen.time(r) as PlainTime)
      const tb = r() < 0.2 ? ta : core.normalize(gen.time(r) as PlainTime)
      const tc = core.compare(ta, tb)

      expect(ta === tb, `${ta} ${tb}`).toBe(tc === 0)
      expect(ta < tb, `${ta} ${tb}`).toBe(tc < 0)
    }
  })
})
