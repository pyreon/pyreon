import { effect, signal } from '@pyreon/reactivity'
import * as format from '../index'
import { resetLocaleState } from '../locale'
import { clearAllTables } from './helpers'

const { setLocale, setTimeZone } = format

afterEach(() => {
  resetLocaleState()
  clearAllTables()
})

function runEffect(fn: () => void): () => void {
  const handle = effect(fn)

  return () => handle.dispose()
}

describe('built formatters follow the active locale', () => {
  it('re-run inside an effect on setLocale', () => {
    setLocale('en-US')
    const n = format.numberFormatter()
    const seen: string[] = []
    const dispose = runEffect(() => {
      seen.push(n(1234567.5))
    })
    setLocale('de')
    expect(seen).toEqual([new Intl.NumberFormat('en-US').format(1234567.5), new Intl.NumberFormat('de').format(1234567.5)])
    dispose()
  })

  it('every kind follows the locale', () => {
    setLocale('en-US')
    const fs = [
      format.currencyFormatter('EUR'),
      format.percentFormatter(),
      format.compactFormatter(),
      format.bytesFormatter(),
      format.listFormatter(),
      format.dateFormatter({ timeZone: 'UTC' }),
      format.durationFormatter(),
    ]
    const inputs: unknown[] = [1234.5, 0.5, 1234567, 1536, ['a', 'b'], '2026-11-18', 3_905_000]
    const call = (i: number) => (fs[i] as unknown as (v: unknown) => string)(inputs[i])
    const before = fs.map((_, i) => call(i))
    setLocale('de')
    const after = fs.map((_, i) => call(i))
    expect(after).not.toEqual(before)
    const direct = [
      format.formatCurrency(1234.5, 'EUR'), format.formatPercent(0.5), format.formatCompact(1234567), format.formatBytes(1536),
      format.formatList(['a', 'b']), format.formatDate('2026-11-18', { timeZone: 'UTC' }), format.formatDuration(3_905_000),
    ]
    expect(after).toEqual(direct)
  })

  it('does not re-run for unrelated signals', () => {
    setLocale('en-US')
    const n = format.numberFormatter()
    const unrelated = signal(0)
    let runs = 0
    const dispose = runEffect(() => {
      runs++
      n(1)
    })
    unrelated.set(1)
    setLocale('en-US')
    expect(runs).toBe(1)
    dispose()
  })

  it('an explicit locale in the options does not subscribe to the active locale', () => {
    setLocale('en-US')
    const n = format.numberFormatter({ locale: 'cs' })
    const d = format.dateFormatter({ locale: 'cs', timeZone: 'UTC' })
    let runs = 0
    const dispose = runEffect(() => {
      runs++
      n(1234.5)
      d(0)
    })
    setLocale('de')
    setLocale('fr')
    setTimeZone('Asia/Tokyo')
    expect(runs).toBe(1)
    dispose()
  })

  it('a derived formatter keeps following: with() on a locale-less formatter', () => {
    setLocale('en-US')
    const f = format.numberFormatter().with({ maximumFractionDigits: 0 })
    const seen: string[] = []
    const dispose = runEffect(() => {
      seen.push(f(1234.5))
    })
    setLocale('de')
    expect(seen).toEqual(['1,235', new Intl.NumberFormat('de', { maximumFractionDigits: 0 }).format(1234.5)])
    dispose()
  })

  it('with({ locale }) pins the derived formatter and unsubscribes it', () => {
    setLocale('en-US')
    const f = format.numberFormatter().with({ locale: 'cs' })
    let runs = 0
    const dispose = runEffect(() => {
      runs++
      f(1)
    })
    setLocale('de')
    expect(runs).toBe(1)
    dispose()
  })

  it('date formatters re-run on setTimeZone, and calendar strings ignore it', () => {
    setLocale('en-US')
    setTimeZone('UTC')
    const d = format.dateTimeFormatter()
    const at = Date.UTC(2026, 10, 18, 23, 30)
    const seen: string[] = []
    const dispose = runEffect(() => {
      seen.push(d(at))
    })
    setTimeZone('Asia/Tokyo')
    expect(seen[1]).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(at))
    expect(d('2026-11-18')).toBe(format.formatDateTime('2026-11-18'))
    dispose()
  })

  it('the relative formatter tracks a base accessor', () => {
    setLocale('en-US')
    const now = signal(Date.UTC(2026, 10, 18, 12))
    const rel = format.relativeFormatter({ base: () => now() })
    const seen: string[] = []
    const dispose = runEffect(() => {
      seen.push(rel(Date.UTC(2026, 10, 18, 12, 5)))
    })
    now.set(Date.UTC(2026, 10, 18, 12, 5))
    expect(seen).toEqual(['in 5 minutes', 'now'])
    dispose()
  })

  it('a bound createFormatter and /core factories never subscribe', async () => {
    setLocale('en-US')
    const core = await import('../core')
    const f = core.numberFormatter({ locale: 'en-US' })
    let runs = 0
    const dispose = runEffect(() => {
      runs++
      f(1)
    })
    setLocale('de')
    expect(runs).toBe(1)
    dispose()
  })
})
