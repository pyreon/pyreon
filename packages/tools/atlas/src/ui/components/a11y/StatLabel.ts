import { txt } from '../../kit'

/** The caption under a headline number — mono caps. */
export const StatLabel = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontFamily: t.font.mono,
  fontSize: t.size.label,
  letterSpacing: t.tracking.lg,
  textTransform: 'uppercase',
  color: t.faint,
}))
