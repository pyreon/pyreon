import { txt } from '../../kit'

export const BrandSub = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontFamily: t.font.mono,
  fontSize: t.size.meta,
  color: t.faint,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  // A long project name gives way before anything else in the bar.
  extendCss: 'min-width:0;@media (max-width:520px){display:none;}',
}))
