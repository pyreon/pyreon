import { el, type T } from '../../kit'

export const SearchDialogCard = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t: T) => ({
    width: 'min(560px,92vw)', marginTop: '12vh', maxHeight: '60vh',
    borderRadius: t.radius.modal, overflow: 'hidden',
    background: t.surface, border: t.hairline,
    extendCss: 'box-shadow:0 24px 80px -16px rgba(0,0,0,.55);animation:atlas-in .14s ease-out;',
  }))
