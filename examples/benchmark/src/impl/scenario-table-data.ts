/**
 * Shared data for the `table` scenario — both arms read the SAME rows and the
 * SAME column definitions, mirroring the happy-dom bench
 * (`packages/fundamentals/table/bench/table-bench.ts`).
 */
export const TABLE_COLS = 6

export interface TableRow {
  id: number
  [k: `c${number}`]: string | number
}

export function makeTableData(n: number, salt = 0): TableRow[] {
  return Array.from({ length: n }, (_, i) => {
    const row: TableRow = { id: i, c0: String(n - i).padStart(7, '0') + salt }
    for (let c = 1; c < TABLE_COLS; c++) row[`c${c}`] = `r${i}c${c}#${salt}`
    return row
  })
}

/** A new array with ONE row replaced by a copy whose `c0` changed. */
export function editOneTableCell(data: TableRow[], rowIndex: number, salt: number): TableRow[] {
  const next = data.slice()
  next[rowIndex] = { ...next[rowIndex]!, c0: `E${salt}` }
  return next
}

export const columnDefs = Array.from({ length: TABLE_COLS }, (_, c) => ({
  accessorKey: `c${c}`,
  id: `c${c}`,
  header: `c${c}`,
}))
