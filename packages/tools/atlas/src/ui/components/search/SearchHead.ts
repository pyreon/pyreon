import { el, type T } from '../../kit'

export const SearchHead = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((t: T) => ({
    padding: '4px 16px', borderBottom: t.hairline, flex: 'none',
    extendCss: `transition:box-shadow ${t.motion.base};&:focus-within{box-shadow:inset 0 -2px 0 ${t.accent};}`,
  }))
