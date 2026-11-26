import { el } from '../../kit'

/**
 * The catalog list: a fixed-height column that SCROLLS. Its rows never shrink
 * — as flex items with the default `flex-shrink: 1`, a bare row button (a
 * component with no parts) gave up its 28px down to its 13px line of text once
 * the catalog outgrew the column, and the names stacked on each other.
 */
export const SideList = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme(() => ({
    flex: '1',
    minHeight: '0',
    overflowY: 'auto',
    padding: '4px 0 16px',
    extendCss: '& > *{flex-shrink:0;}',
  }))
