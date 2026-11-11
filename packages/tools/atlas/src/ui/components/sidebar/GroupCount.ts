import { txt } from '../../kit'

export const GroupCount = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontFamily: t.font.mono,
  fontSize: t.size.label,
  letterSpacing: '0',
  color: t.faint,
}))
