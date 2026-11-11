import { txt } from '../../kit'

export const A11yTitle = txt.attrs({ tag: 'div' }).theme((t) => ({
  fontSize: t.size.body,
  fontWeight: '500',
  color: t.text,
  marginBottom: '2px',
  overflowWrap: 'anywhere',
}))
