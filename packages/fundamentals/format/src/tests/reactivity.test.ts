import { computed, effect, signal } from '@pyreon/reactivity'
import * as format from '../index'
import { resetLocaleState } from '../locale'
import { clearAllTables } from './helpers'

const { formatNumber, formatDate, setLocale, setTimeZone, locale, timeZone } = format

afterEach(() => {
  resetLocaleState()
  clearAllTables()
})

/** An effect whose disposer is a plain function. */
function runEffect(fn: () => void): () => void {
  const handle = effect(fn)
  return () => handle.dispose()
}

/** Run `read` in an effect; returns the recorded outputs and how many times it ran. */
function track<T>(read: () => T) {
  const seen: T[] = []
  const dispose = runEffect(() => {
    seen.push(read())
  })

  return { seen, dispose }
}

describe('setLocale', () => {
  it('re-runs a formatter inside an effect', () => {
    setLocale('en-US')
    const { seen, dispose } = track(() => formatNumber(1234567.5))
    expect(seen).toEqual([new Intl.NumberFormat('en-US').format(1234567.5)])
    setLocale('de')
    expect(seen).toEqual([new Intl.NumberFormat('en-US').format(1234567.5), new Intl.NumberFormat('de').format(1234567.5)])
    dispose()
  })

  it('re-runs a computed', () => {
    setLocale('en-US')
    const total = signal(1000)
    const label = computed(() => formatNumber(total()))
    expect(label()).toBe('1,000')
    setLocale('de')
    expect(label()).toBe(new Intl.NumberFormat('de').format(1000))
    total.set(2500)
    expect(label()).toBe(new Intl.NumberFormat('de').format(2500))
  })

  it('does not re-run for unrelated signals', () => {
    setLocale('en-US')
    const unrelated = signal(0)
    let runs = 0
    const dispose = runEffect(() => {
      runs++
      formatNumber(5)
    })
    unrelated.set(1)
    unrelated.set(2)
    expect(runs).toBe(1)
    setLocale('en-US') // same value: no notification
    expect(runs).toBe(1)
    dispose()
  })

  it('an explicit locale option does not subscribe to the active locale', () => {
    setLocale('en-US')
    let runs = 0
    const dispose = runEffect(() => {
      runs++
      formatNumber(1234.5, { locale: 'cs' })
      format.formatDate(0, { locale: 'cs', timeZone: 'UTC' })
    })
    setLocale('de')
    setLocale('fr')
    expect(runs).toBe(1)
    dispose()
  })

  it('a bound formatter (createFormatter) never subscribes', () => {
    setLocale('en-US')
    const bound = format.createFormatter({ locale: 'cs' })
    let runs = 0
    const dispose = runEffect(() => {
      runs++
      bound.number(1234.5)
    })
    setLocale('de')
    expect(runs).toBe(1)
    dispose()
  })

  it('locale() is the reactive read, normalized', () => {
    setLocale('EN-us')
    expect(locale()).toBe('en-US')
    const { seen, dispose } = track(() => locale())
    setLocale('cs')
    expect(seen).toEqual(['en-US', 'cs'])
    dispose()
  })

  it('the default is the runtime locale when nothing is set', () => {
    expect(locale()).toBe(new Intl.DateTimeFormat().resolvedOptions().locale === '' ? 'en-US' : locale())
    expect(formatNumber(1234.5)).toBe(new Intl.NumberFormat(locale()).format(1234.5))
  })
})

describe('setTimeZone', () => {
  it('re-runs date formatters and timeZone() is reactive', () => {
    setLocale('en-US')
    setTimeZone('UTC')
    const at = Date.UTC(2026, 10, 18, 23, 30)
    const { seen, dispose } = track(() => formatDate(at, { dateStyle: 'short' }))
    const zones = track(() => timeZone())
    setTimeZone('Asia/Tokyo')
    expect(seen).toEqual([
      new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: 'UTC' }).format(at),
      new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: 'Asia/Tokyo' }).format(at),
    ])
    expect(zones.seen).toEqual(['UTC', 'Asia/Tokyo'])
    expect(seen[0]).not.toBe(seen[1])
    dispose()
    zones.dispose()
  })

  it('number formatters do not subscribe to the zone, date formatters of calendar values need no zone but still follow the locale', () => {
    setTimeZone('UTC')
    let runs = 0
    const dispose = runEffect(() => {
      runs++
      formatNumber(1)
    })
    setTimeZone('Asia/Tokyo')
    expect(runs).toBe(1)
    dispose()
  })

  it('an explicit timeZone option does not subscribe to the active zone', () => {
    let runs = 0
    const dispose = runEffect(() => {
      runs++
      formatDate(0, { locale: 'en-US', timeZone: 'UTC' })
    })
    setTimeZone('Asia/Tokyo')
    setTimeZone('Europe/Prague')
    expect(runs).toBe(1)
    dispose()
  })

  it('timeZone() defaults to the runtime zone name', () => {
    expect(timeZone()).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})
