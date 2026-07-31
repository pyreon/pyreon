import { cx, txt } from '../../kit'

export const CanvasName = txt
  .attrs({
    tag: 'span',
  })
  .theme(() => cx("font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:15px;"))
