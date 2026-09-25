import { el, type T } from '../../kit'

/** The compact layout's "open the addon panels" button in the canvas bar. */
export const PanelsBtn = el
  .attrs({ tag: 'button' })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    flex: 'none',
    padding: '6px 12px',
    borderRadius: t.radius.button,
    border: t.hairline,
    fontSize: t.size.body,
    fontWeight: '600',
    color: t.text,
    background: t.surface2,
    hover: { borderColor: t.accent },
  }))
