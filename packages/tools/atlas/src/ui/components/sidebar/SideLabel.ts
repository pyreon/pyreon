import { txt } from '../../kit'

export const SideLabel = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontFamily: t.font.mono,
  fontSize: t.size.label,
  letterSpacing: t.tracking.xxl,
  textTransform: 'uppercase',
  color: t.faint,
}))
