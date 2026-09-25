import type { DocNode, DocumentRenderer, RenderOptions, TableColumn } from '../types'

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

/**
 * Serialize one CSV cell.
 *
 * FORMULA INJECTION (CWE-1236): a spreadsheet opening the file evaluates a
 * cell that starts with `=` `+` `-` `@` (or a tab / CR, which some apps
 * strip before evaluating) — `=HYPERLINK("http://evil",…)` or a DDE
 * payload runs on open. Such TEXT cells are prefixed with `'`, which every
 * spreadsheet treats as "literal text". A genuine JS number is never
 * prefixed: it cannot be a formula, and `-5` must stay numeric.
 *
 * Quoting covers `,` `"` and every line break (`\r` too — a bare CR ends
 * the record in RFC 4180 readers).
 */
function escapeCsv(value: string | number): string {
  let s = String(value)
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function findTables(node: DocNode): DocNode[] {
  const tables: DocNode[] = []
  if (node.type === 'table') {
    tables.push(node)
  }
  for (const child of node.children) {
    if (typeof child !== 'string') {
      tables.push(...findTables(child))
    }
  }
  return tables
}

function tableToCsv(node: DocNode): string {
  const columns = ((node.props.columns ?? []) as (string | TableColumn)[]).map(resolveColumn)
  const rows = (node.props.rows ?? []) as (string | number)[][]

  const lines: string[] = []

  // Caption as a leading `# …` line, serialized as a CSV cell so a newline
  // in the caption cannot inject a record of its own.
  if (node.props.caption) {
    lines.push(escapeCsv(`# ${String(node.props.caption)}`))
  }

  // Header
  lines.push(columns.map((c) => escapeCsv(c.header)).join(','))

  // Rows
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsv(cell ?? '')).join(','))
  }

  return lines.join('\n')
}

export const csvRenderer: DocumentRenderer = {
  async render(node: DocNode, _options?: RenderOptions): Promise<string> {
    const tables = findTables(node)

    if (tables.length === 0) {
      return '# No tables found in document\n'
    }

    // If multiple tables, separate with blank lines
    return `${tables.map(tableToCsv).join('\n\n')}\n`
  },
}
