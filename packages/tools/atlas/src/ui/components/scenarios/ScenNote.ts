import { txt } from '../../kit'

/** The strip's fallback text — no scenarios, or edited args. */
export const ScenNote = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontSize: t.size.small,
  color: t.faint,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: '0',
}))
