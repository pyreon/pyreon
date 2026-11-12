import { el } from '../../kit'

/** Run the active scenario's authored `play` script against the live preview. */
export const PlayBtn = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme((t) => ({
    font: 'inherit',
    cursor: 'pointer',
    flex: 'none',
    height: '26px',
    padding: '0 10px',
    borderRadius: t.radius.pill,
    border: `1px solid color-mix(in srgb, ${t.accent} 45%, transparent)`,
    background: t.glow,
    color: t.accent,
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    hover: { borderColor: t.accent },
  }))
