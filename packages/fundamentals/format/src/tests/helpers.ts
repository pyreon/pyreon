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
