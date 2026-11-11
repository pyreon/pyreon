import { el } from '../../kit'

/** One headline cell — a dot and a line of text, or a `StatNum` over a `StatLabel`. */
export const A11yStat = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 8,
  })
  .theme((t) => ({
    flexWrap: 'wrap',
    minWidth: '0',
    padding: '12px',
    fontSize: t.size.body,
    color: t.text,
  }))
