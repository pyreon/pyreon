import { el } from '../../kit'

/**
 * The filter's own non-scrolling row. It used to sit INSIDE the scrolling
 * list, whose `overflow: auto` clipped the focus ring at the sidebar edge.
 */
export const FilterWrap = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({
    flex: 'none',
    padding: '0 12px 8px',
  }))
