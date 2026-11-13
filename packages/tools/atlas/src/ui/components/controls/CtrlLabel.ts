import { txt } from '../../kit'

export const CtrlLabel = txt.attrs({ tag: 'label' }).theme((t) => ({
  fontFamily: t.font.mono,
  fontSize: t.size.caption,
  color: t.muted,
  overflowWrap: 'anywhere',
}))
