import { clearTable } from '../cache'
import { _clearDurationTable } from '../duration'
import { _clearDateTables } from '../datetime'
import { _clearNumberTables } from '../number'
import { _clearListTable } from '../list'
import { _clearParseCache } from '../parse'

/** Drop every cached formatter (after changing `process.env.TZ`, or to count constructions). */
export function clearAllTables(): void {
  _clearNumberTables()
  _clearDateTables()
  _clearDurationTable()
  _clearListTable()
  _clearParseCache()
}

export { clearTable }

type Ctor = 'NumberFormat' | 'DateTimeFormat' | 'ListFormat' | 'RelativeTimeFormat'

/** How many `Intl[name]` objects `run` constructs (a counting `Proxy` for its duration). */
export function constructions(name: Ctor, run: () => void): number {
  const Original = Intl[name] as unknown as new (...args: unknown[]) => object
  let count = 0
  const Counting = new Proxy(Original, {
    construct(target, args) {
      count++

      return Reflect.construct(target, args) as object
    },
  })
  Reflect.set(Intl, name, Counting)
  try {
    run()
  } finally {
    Reflect.set(Intl, name, Original)
  }

  return count
}
