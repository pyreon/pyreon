import { txt } from '../../kit'

export const CountPill = txt
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    fontSize: t.size.caption,
    padding: '2px 8px',
    borderRadius: t.radius.pill,
    color: t.muted,
    background: t.surface2,
  }))
