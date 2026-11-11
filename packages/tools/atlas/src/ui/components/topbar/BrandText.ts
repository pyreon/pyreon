import { txt } from '../../kit'

/** The product name. Gives way below 520px so the view tabs keep their room. */
export const BrandText = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontWeight: '600',
  fontSize: t.size.text,
  letterSpacing: '-.01em',
  color: t.text,
  extendCss: '@media (max-width:519.98px){display:none;}',
}))
