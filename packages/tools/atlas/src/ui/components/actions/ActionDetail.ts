import { txt } from '../../kit'

export const ActionDetail = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontFamily: t.font.mono,
  fontSize: t.size.small,
  color: t.muted,
  overflowWrap: 'anywhere',
  minWidth: '0',
}))
