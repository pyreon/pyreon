import { cx, txt } from '../../kit'

export const BrandText = txt
  .attrs({
    tag: 'span',
  })
  .theme(() => cx("font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;letter-spacing:-.01em;"))
