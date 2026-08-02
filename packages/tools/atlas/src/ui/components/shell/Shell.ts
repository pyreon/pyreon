import { el, type T } from '../../kit'

export const Shell = el
  .attrs({
    tag: 'div',
    // block — the root must FILL the viewport; Element defaults to
    // inline-flex, which shrink-wraps the whole app to its content width.
    block: true,
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t: T) => ({
    height: '100vh',
    overflow: 'hidden',
    fontFamily: t.font.sans,
    fontSize: t.size.heading,
    background: t.bg,
    color: t.text,
    extendCss: '-webkit-font-smoothing:antialiased;',
  }))
