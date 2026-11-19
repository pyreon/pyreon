import { bad, checkOptions } from './check'

/** One block to place in a day column: its key and its start and end in minutes. */
export interface PackInput {
  key: string
  start: number
  end: number
}

export interface PackOptions {
  /** A block is at least this many minutes tall for the purpose of overlap (so a short event gets its own column). Default 15. */
  minMinutes?: number
  /** Columns to keep for blocks (key to column), for the blocks that must not move while another is being dragged. Best effort. */
  pinned?: ReadonlyMap<string, number>
}

export interface Packed {
  key: string
  /** 0-based column within the group of overlapping blocks. */
  column: number
  /** How many columns the group has. */
  columns: number
  /** How many columns this block spans (it grows to the right into free columns). */
  span: number
}

interface Item {
  key: string
  start: number
  end: number
  column: number
}

/** Blocks sorted for packing: earlier first, longer first among equal starts, then by key (a total order). */
function sorted(blocks: readonly PackInput[], min: number): Item[] {
  return blocks
    .map((b) => ({ key: b.key, start: b.start, end: Math.max(b.end, b.start + min), column: 0 }))
    .sort((a, b) => a.start - b.start || b.end - a.end || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/** The first interval index in a column (sorted, disjoint) whose start is at or after `end`. */
function firstStartingAtOrAfter(column: readonly Item[], end: number): number {
  let lo = 0
  let hi = column.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((column[mid] as Item).start < end) lo = mid + 1
    else hi = mid
  }

  return lo
}

/** Does anything in the column overlap `[start, end)`? */
function busy(column: readonly Item[], start: number, end: number): boolean {
  const at = firstStartingAtOrAfter(column, end) - 1

  return at >= 0 && (column[at] as Item).end > start
}

/** Put `item` in `column`, keeping the column sorted by start. */
function insert(column: Item[], item: Item): void {
  column.splice(firstStartingAtOrAfter(column, item.start), 0, item)
}

/** Give every item a column: the pinned ones first (when their column is free), then the rest into the first column that is free. */
function assign(group: readonly Item[], pinned: ReadonlyMap<string, number> | undefined): Item[][] {
  const columns: Item[][] = []
  const place = (item: Item, at: number): void => {
    item.column = at
    insert((columns[at] ??= []), item)
  }
  const rest: Item[] = []
  for (const item of group) {
    const want = pinned?.get(item.key)
    if (want !== undefined && want <= columns.length && !busy(columns[want] ?? [], item.start, item.end)) place(item, want)
    else rest.push(item)
  }
  for (const item of rest) {
    let at = columns.findIndex((column) => !busy(column, item.start, item.end))
    if (at < 0) at = columns.length
    place(item, at)
  }

  return columns
}

/**
 * Overlapping blocks share the width of a day column. Blocks that overlap, directly or through a chain, form a group; the
 * blocks of a group are put in columns by the standard interval colouring (the first column that is free), and each block
 * then grows to the right through the columns that are free for its whole length. The result depends only on the blocks (not
 * on their order in the input), so blocks do not jump when others are added; `pinned` keeps chosen blocks in their column.
 * Each placement is a binary search, so 200 events in one hour cost a few thousand steps, not forty thousand.
 *
 * @example packColumns([{ key: 'a', start: 540, end: 600 }, { key: 'b', start: 570, end: 630 }]).map((p) => [p.key, p.column, p.columns]) // => [['a', 0, 2], ['b', 1, 2]]
 */
export function packColumns(blocks: readonly PackInput[], options: PackOptions = {}): Packed[] {
  if (!Array.isArray(blocks) || (blocks[0] !== undefined && !(typeof blocks[0]?.key === 'string' && typeof blocks[0]?.start === 'number' && typeof blocks[0]?.end === 'number'))) bad('packColumns', 'blocks', 'an array of { key, start, end } (minutes)', blocks, 'Map occurrences to blocks first.')
  checkOptions('packColumns', 'options', options)
  const items = sorted(blocks, options.minMinutes ?? 15)
  const out: Packed[] = []
  let from = 0
  while (from < items.length) {
    let to = from + 1
    let reach = (items[from] as Item).end
    while (to < items.length && (items[to] as Item).start < reach) {
      reach = Math.max(reach, (items[to] as Item).end)
      to++
    }
    const group = items.slice(from, to)
    const columns = assign(group, options.pinned)
    for (const item of group) {
      let span = 1
      while (item.column + span < columns.length && !busy(columns[item.column + span] as Item[], item.start, item.end)) span++
      out.push({ key: item.key, column: item.column, columns: columns.length, span })
    }
    from = to
  }

  return out
}
