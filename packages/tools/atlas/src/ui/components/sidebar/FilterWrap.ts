import { el } from '../../kit'

/**
 * The filter's own non-scrolling row. Inside the scrolling list,
 * `overflow: auto` clipped the focus ring at the catalog edge.
 */
export const FilterWrap = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({
    flex: 'none',
    padding: '8px 12px 4px',
  }))
