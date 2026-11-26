import { describe, expect, it } from 'vitest'
import { createCalendar, gridMove, slotMove } from '../index'

describe('gridMove', () => {
  it('moves by a day, a week, to the week edges, and by a month or a year', () => {
    expect(gridMove('2026-11-18', { key: 'ArrowLeft' })).toBe('2026-11-17')
    expect(gridMove('2026-11-18', { key: 'ArrowRight' })).toBe('2026-11-19')
    expect(gridMove('2026-11-18', { key: 'ArrowUp' })).toBe('2026-11-11')
    expect(gridMove('2026-11-18', { key: 'ArrowDown' })).toBe('2026-11-25')
    expect(gridMove('2026-11-18', { key: 'Home' })).toBe('2026-11-16')
    expect(gridMove('2026-11-18', { key: 'End' })).toBe('2026-11-22')
    expect(gridMove('2026-11-18', { key: 'Home' }, { weekStart: 7 })).toBe('2026-11-15')
    expect(gridMove('2026-01-31', { key: 'PageDown' })).toBe('2026-02-28')
    expect(gridMove('2028-02-29', { key: 'PageUp', shiftKey: true })).toBe('2027-02-28')
    expect(gridMove('2026-11-18', { key: 'x' })).toBeNull()
    expect(gridMove('2026-11-18', { key: 'ArrowLeft', ctrlKey: true })).toBeNull()
  })

  it('swaps Left and Right in right-to-left text', () => {
    expect(gridMove('2026-11-18', { key: 'ArrowRight' }, { rtl: true })).toBe('2026-11-17')
    expect(gridMove('2026-11-18', { key: 'ArrowLeft' }, { rtl: true })).toBe('2026-11-19')
  })

  it('skips hidden weekdays: across a hidden weekend, and at the edges of the week', () => {
    const hidden = { hiddenDays: [6, 7] as const }
    expect(gridMove('2026-11-20', { key: 'ArrowRight' }, hidden)).toBe('2026-11-23')
    expect(gridMove('2026-11-23', { key: 'ArrowLeft' }, hidden)).toBe('2026-11-20')
    expect(gridMove('2026-11-18', { key: 'End' }, hidden)).toBe('2026-11-20')
    expect(gridMove('2026-11-18', { key: 'Home' }, { hiddenDays: [1] })).toBe('2026-11-17')
    expect(gridMove('2026-11-21', { key: 'PageDown' }, hidden)).toBe('2026-12-21')
  })
})

describe('slotMove', () => {
  const o = { from: 480, to: 1080, slot: 30, dates: ['2026-11-16', '2026-11-17', '2026-11-18'] as const }
  const at = (minute: number, date = '2026-11-17') => ({ date, minute }) as never

  it('moves by a slot and a day, to the first and last slot, and by a week of columns', () => {
    expect(slotMove(at(600), { key: 'ArrowDown' }, o)).toEqual(at(630))
    expect(slotMove(at(600), { key: 'ArrowUp' }, o)).toEqual(at(570))
    expect(slotMove(at(600), { key: 'ArrowRight' }, o)).toEqual(at(600, '2026-11-18'))
    expect(slotMove(at(600), { key: 'ArrowLeft' }, o)).toEqual(at(600, '2026-11-16'))
    expect(slotMove(at(600), { key: 'Home' }, o)).toEqual(at(480))
    expect(slotMove(at(600), { key: 'End' }, o)).toEqual(at(1050))
    expect(slotMove(at(600), { key: 'PageDown' }, o)).toEqual(at(600, '2026-11-18'))
    expect(slotMove(at(600), { key: 'x' }, o)).toBeNull()
  })

  it('stays inside the grid, and swaps Left and Right in right-to-left text', () => {
    expect(slotMove(at(480), { key: 'ArrowUp' }, o)).toEqual(at(480))
    expect(slotMove(at(1050), { key: 'ArrowDown' }, o)).toEqual(at(1050))
    expect(slotMove(at(600, '2026-11-16'), { key: 'ArrowLeft' }, o)).toEqual(at(600, '2026-11-16'))
    expect(slotMove(at(600), { key: 'ArrowRight' }, { ...o, rtl: true })).toEqual(at(600, '2026-11-16'))
  })

  it('pages seven slots down and up the day in a one-day view, kept inside the grid', () => {
    const day = { ...o, dates: ['2026-11-17'] as const }
    expect(slotMove(at(600), { key: 'PageDown' }, day)).toEqual(at(810))
    expect(slotMove(at(600), { key: 'PageUp' }, day)).toEqual(at(480))
    expect(slotMove(at(900), { key: 'PageUp' }, day)).toEqual(at(690))
    expect(slotMove(at(900), { key: 'PageDown' }, day)).toEqual(at(1050))
  })
})

describe('opening hours', () => {
  const make = (businessHours: never) => createCalendar({ events: () => [], date: '2026-12-23', view: 'week', timeZone: () => 'UTC', locale: () => 'en-GB', businessHours, now: () => 0 }).timeGrid()

  it('a holiday and a weekend are closed all day; an overnight window shades the next morning', () => {
    const grid = make({ hours: { 1: [{ from: '09:00', to: '17:00' }], 2: [{ from: '09:00', to: '17:00' }], 3: [{ from: '09:00', to: '17:00' }], 4: [{ from: '22:00', to: '02:00' }] }, weekend: [6, 7], holidays: ['2026-12-24'] } as never)
    const by = (date: string) => grid.days.find((d) => d.date === date)!.business
    expect(by('2026-12-23')).toEqual([{ top: 9 / 24, height: 8 / 24 }])
    expect(by('2026-12-24')).toEqual([])
    expect(by('2026-12-26')).toEqual([])
    const overnight = make({ hours: { 4: [{ from: '22:00', to: '02:00' }] } } as never)
    expect(overnight.days.find((d) => d.date === '2026-12-24')!.business).toEqual([{ top: 22 / 24, height: 2 / 24 }])
    expect(overnight.days.find((d) => d.date === '2026-12-25')!.business).toEqual([{ top: 0, height: 2 / 24 }])
  })
})
