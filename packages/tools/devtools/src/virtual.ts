/**
 * Index range of fixed-height rows to render for a scrolled viewport, with
 * `overscan` extra rows on each side. `end` is exclusive. Lists use it so a
 * 10,000-row tree or table keeps ~50 rows in the DOM.
 */
export function visibleRange(
  scrollTop: number,
  viewport: number,
  rowHeight: number,
  count: number,
  overscan = 8,
): { start: number; end: number } {
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0 }
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visible = Math.ceil(Math.max(0, viewport) / rowHeight) + 1
  const start = Math.max(0, Math.min(count - 1, first) - overscan)
  const end = Math.min(count, first + visible + overscan)
  return { start, end }
}

/** The scrollTop that brings row `index` fully into view (unchanged when it already is). */
export function scrollToRow(
  index: number,
  scrollTop: number,
  viewport: number,
  rowHeight: number,
  headerOffset = 0,
): number {
  const top = index * rowHeight
  const bottom = top + rowHeight
  const visibleTop = scrollTop
  const visibleBottom = scrollTop + viewport - headerOffset
  if (top < visibleTop) return top
  if (bottom > visibleBottom) return bottom - (viewport - headerOffset)
  return scrollTop
}
