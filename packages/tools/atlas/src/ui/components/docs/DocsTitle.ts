import { cx, txt } from '../../kit'

export const DocsTitle = txt
  .attrs({
    tag: 'h1',
  })
  .theme(() => cx("font-family:'Space Grotesk',sans-serif;font-size:30px;font-weight:700;margin:0;letter-spacing:-.02em;"))
