import { el, type T } from '../../kit'

export const ProfileMenu = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t: T) => ({
    position: 'absolute', top: 'calc(100% + 8px)', right: '0', zIndex: '70',
    width: '224px', padding: '8px', borderRadius: t.radius.panel,
    background: t.surface, border: t.hairline,
    extendCss: 'box-shadow:0 16px 48px -12px rgba(0,0,0,.5);animation:atlas-in .12s ease-out;',
  }))
