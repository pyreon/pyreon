import type { DocNode, DocumentRenderer, RenderOptions, TableColumn } from '../types'

function resolveColumn(col: string | TableColumn): TableColumn {
  return typeof col === 'string' ? { header: col } : col
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
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

  // Caption as comment
  if (node.props.caption) {
    lines.push(`# ${node.props.caption}`)
  }

  // Header
  lines.push(columns.map((c) => escapeCsv(c.header)).join(','))

  // Rows
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsv(String(cell ?? ''))).join(','))
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
