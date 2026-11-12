import { el } from '../../kit'

/** An empty state (`.empty2`). */
export const ActionsEmpty = el
  .attrs({
    tag: 'div',
  })
  .theme((t) => ({
    textAlign: 'center',
    padding: '32px 20px',
    fontSize: t.size.text,
    color: t.faint,
  }))
