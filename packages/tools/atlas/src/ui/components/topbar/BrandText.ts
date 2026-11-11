import { txt } from '../../kit'

export const BrandText = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontWeight: '600',
  fontSize: t.size.text,
  letterSpacing: '-.01em',
  color: t.text,
}))
