import { el, type T } from '../../kit'

/** "Clear filter" under the no-matches message. */
export const EmptyAction = el
  .attrs({ tag: 'button' })
  .theme((t: T) => ({
    font: 'inherit',
    fontFamily: t.font.sans,
    cursor: 'pointer',
    marginTop: '12px',
    padding: '6px 12px',
    borderRadius: t.radius.button,
    border: t.hairline,
    fontSize: t.size.body,
    color: t.text,
    background: 'transparent',
    hover: { borderColor: t.accent },
  }))
