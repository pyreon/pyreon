import { el, type T } from '../../kit'

export const PropsRow = el
  .attrs({
    tag: 'div',
    // FULL WIDTH. An Element shrink-wraps by default, so each grid row sized
    // its `fr` columns to its own content and no two rows lined up (the TYPE
    // cell of one row sat under the DEFAULT header of another). `block` makes
    // every row the table's width, so the same column template yields the
    // same columns.
    block: true,
  })
  .theme((t: T) => ({
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr 1fr',
    columnGap: '16px',
    padding: '11px 16px',
    borderTop: t.hairline,
    fontSize: t.size.text,
    alignItems: 'center',
  }))
