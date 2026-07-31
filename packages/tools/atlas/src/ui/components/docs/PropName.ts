import { cx, txt } from '../../kit'

export const PropName = txt
  .attrs({
    tag: 'span',
  })
  .theme(() => cx("font-family:'JetBrains Mono',monospace;font-weight:600;"))
