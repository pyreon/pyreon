import { el } from '../../kit'

/** The app frame: a 48px top bar over the body, filling the viewport. */
export const Shell = el
  .attrs({
    tag: 'div',
    // block — the root must FILL the viewport; Element defaults to
    // inline-flex, which shrink-wraps the whole app to its content width.
    block: true,
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t) => ({
    height: '100vh',
    overflow: 'hidden',
    fontFamily: t.font.sans,
    fontSize: t.size.text,
    background: t.bg,
    color: t.text,
    extendCss: 'height:100dvh;-webkit-font-smoothing:antialiased;',
  }))
