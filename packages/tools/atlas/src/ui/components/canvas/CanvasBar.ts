import { el } from '../../kit'

export const CanvasBar = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 16,
  })
  .theme((t) => ({
    height: '52px',
    flex: 'none',
    padding: '0 16px',
    extendCss: '@media (max-width:900px){gap:8px;padding:0 8px;}',
    borderBottom: t.hairline,
    background: t.surface,
  }))
