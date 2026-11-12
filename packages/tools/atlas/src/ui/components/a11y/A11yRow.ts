import { el } from '../../kit'

/** A finding row: status chip, then title + note. Hairline-separated, 12px gutters. */
export const A11yRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'top',
    gap: 10,
  })
  .theme((t) => ({
    padding: '8px 12px',
    borderBottom: t.hairline,
    minWidth: '0',
    hover: { background: t.sheen },
  }))
