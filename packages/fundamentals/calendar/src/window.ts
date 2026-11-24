import { bad } from './check'

export interface RowWindow {
  /** The first and last (exclusive) row to draw. */
  start: number
  end: number
  /** The height above the first drawn row, and of all rows. */
  offset: number
  total: number
}

/**
 * Which rows to draw: rows have known heights, the viewport shows `viewport` pixels from `scrollTop`, and `overscan` rows more
 * on each side are kept so a fast scroll does not show a gap. Binary search over the running total, so a 10,000 row list costs
 * the same as a 10.
 */
export function windowRows(heights: readonly number[], scrollTop: number, viewport: number, overscan = 3): RowWindow {
  if (!Array.isArray(heights)) bad('windowRows', 'heights', 'an array of row heights in pixels', heights)
  const tops = new Array<number>(heights.length + 1)
  tops[0] = 0
  for (let i = 0; i < heights.length; i++) tops[i + 1] = (tops[i] as number) + (heights[i] as number)
  const total = tops[heights.length] as number
  const at = (y: number): number => {
    let lo = 0
    let hi = heights.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((tops[mid + 1] as number) <= y) lo = mid + 1
      else hi = mid
    }

    return lo
  }
  const start = Math.max(0, at(Math.max(0, scrollTop)) - overscan)
  const end = Math.min(heights.length, at(Math.max(0, scrollTop) + Math.max(0, viewport)) + 1 + overscan)

  return { start, end, offset: tops[start] as number, total }
}
