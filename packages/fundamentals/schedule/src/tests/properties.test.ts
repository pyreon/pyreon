import { describe, expect, it } from 'vitest'
import { nextOccurrence, occurrences, occurrencesBetween, occursOn, parseRRule, previousOccurrence, toRRule } from '../core'
import { makeCase } from './diff-gen'
import { int, rng } from './rng'
import { makeWideCase } from './wide-gen'
import type { Recurrence } from '../types'

const rules = (n: number): Recurrence[] => Array.from({ length: n }, (_, i) => makeWideCase(i + 1).rule)

/** A value one millisecond after / before, so "strictly after" can be written as a closed range. */
const sorted = (list: readonly string[]): boolean => list.every((v, i) => i === 0 || list[i - 1]! < v)

describe('properties of the expansion', () => {
  it('occurrencesBetween equals filtering the lazy generator, for random windows', () => {
    const r = rng(11)

    for (const rule of rules(500)) {
      const all = [...occurrences(rule, { limit: 60 })] as string[]

      if (all.length < 3) continue
      const a = all[int(r, 0, all.length - 2)]!
      const b = all[int(r, 0, all.length - 1)]!
      const [lo, hi] = a <= b ? [a, b] : [b, a]

      expect(occurrencesBetween(rule, lo as never, hi as never), JSON.stringify(rule)).toEqual(all.filter((v) => v >= lo && v <= hi))
      expect([...occurrences(rule, { from: lo as never, to: hi as never })]).toEqual(all.filter((v) => v >= lo && v <= hi))
    }
  })

  it('splitting a window in two gives the two halves of the occurrences', () => {
    for (const rule of rules(300)) {
      const all = [...occurrences(rule, { limit: 40 })] as string[]

      if (all.length < 4) continue
      const at = Math.floor(all.length / 2)
      const mid = all[at]!
      const left = occurrencesBetween(rule, all[0] as never, mid as never)
      const right = [...occurrences(rule, { from: mid as never, limit: all.length - at })].slice(1)

      expect([...left, ...right], JSON.stringify(rule)).toEqual(all)
    }
  })

  it('occurrences are strictly ascending and each one occurs on its own date', () => {
    for (const rule of rules(400)) {
      const all = [...occurrences(rule, { limit: 30 })] as string[]

      expect(sorted(all), JSON.stringify(rule)).toBe(true)
      for (const o of all.slice(0, 5)) expect(occursOn(rule, o.slice(0, 10) as never)).toBe(true)
    }
  })

  it('nextOccurrence and previousOccurrence step between neighbours', () => {
    for (const rule of rules(300)) {
      const all = [...occurrences(rule, { limit: 12 })] as string[]

      for (let i = 0; i + 1 < all.length; i++) {
        expect(nextOccurrence(rule, all[i] as never), JSON.stringify(rule)).toBe(all[i + 1])
        expect(previousOccurrence(rule, all[i + 1] as never)).toBe(all[i])
      }
      if (all.length > 0) expect(previousOccurrence(rule, all[0] as never)).toBeNull()
    }
  })

  it('hourly and minutely occurrences all sit on the rule\'s grid from its start', () => {
    let checked = 0

    for (let seed = 1; seed <= 600; seed++) {
      const c = makeCase(seed)

      if (c.rule.every !== 'hour' && c.rule.every !== 'minute') continue
      const unit = c.rule.every === 'hour' ? 3_600_000 : 60_000
      const start = Date.parse(`${c.rule.start}:00Z`)

      for (const o of occurrences(c.rule, { limit: 20 }) as Generator<string>) {
        const t = Date.parse(`${o}:00Z`)

        // Only the hourly rule with BYMINUTE moves minutes within its hour; every other occurrence is on the grid.
        if (c.rule.every === 'hour' && c.rule.on?.minutes !== undefined) expect((Math.floor(t / 3_600_000) * 3_600_000 - Math.floor(start / 3_600_000) * 3_600_000) / 3_600_000 % (c.rule.interval ?? 1)).toBe(0)
        else expect(((t - start) / unit) % (c.rule.interval ?? 1), `${JSON.stringify(c.rule)} ${o}`).toBe(0)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })
})

describe('RRULE text: toRRule(parseRRule(x)) normalises to the same rule', () => {
  it('writing, parsing and writing again gives the same text, and the same occurrences', () => {
    for (const rule of rules(400)) {
      const text = toRRule(rule)
      const back = parseRRule(text)

      expect(toRRule(back), JSON.stringify(rule)).toBe(text)
      expect([...occurrences(back, { limit: 10 })]).toEqual([...occurrences(rule, { limit: 10 })])
    }
  })

  it('also with a time zone, an until in the zone, except and also entries', () => {
    const rule: Recurrence = { every: 'week', interval: 2, start: '2026-11-18T09:00', timeZone: 'Europe/Prague', until: '2027-03-01T12:00', on: { weekdays: [2, 4] }, except: ['2026-12-01T09:00'], also: ['2026-12-25T10:00'], weekStart: 7 }
    const text = toRRule(rule)

    expect(parseRRule(text)).toEqual(rule)
    expect(toRRule(parseRRule(text))).toBe(text)
  })
})
