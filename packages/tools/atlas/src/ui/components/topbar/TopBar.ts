import { el } from '../../kit'

export const TopBar = el
  .attrs({
    tag: 'header',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 16,
  })
  .theme((t) => ({
    // ONE row at every width. It used to wrap, which at phone width stacked
    // brand / segment / search into a 163px header; the compact layout now
    // shrinks the row instead (icon-only search, no brand text).
    height: '56px',
    flex: 'none',
    minWidth: '0',
    padding: '0 16px',
    extendCss: '@media (max-width:900px){padding:0 8px;}',
    zIndex: '10',
    borderBottom: t.hairline,
    background: t.surface,
  }))
