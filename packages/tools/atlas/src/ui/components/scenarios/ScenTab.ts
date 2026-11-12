import { el } from '../../kit'

/** One scenario tab: verdict dot + name, 28px. */
export const ScenTab = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 7 })
  .theme((t) => ({
    font: 'inherit',
    cursor: 'pointer',
    flex: 'none',
    border: 'none',
    height: '28px',
    padding: '0 10px',
    borderRadius: t.radius.item,
    fontSize: t.size.body,
    whiteSpace: 'nowrap',
    color: t.faint,
    background: 'transparent',
    hover: { color: t.text },
  }))
  .states((t) => ({
    active: { color: t.text, backgroundColor: t.surface2 },
    idle: {},
  }))
