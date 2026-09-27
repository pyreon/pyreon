import { el } from '../../kit'

export const RightRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    contentAlignX: 'right',
    gap: 8,
  })
  .theme(() => ({
    minWidth: '192px',
    flex: 'none',
    // The desktop min-width balances the brand column so the search trigger
    // centres; the compact bar has no brand column to balance.
    extendCss: '@media (max-width:900px){min-width:0;}',
  }))
