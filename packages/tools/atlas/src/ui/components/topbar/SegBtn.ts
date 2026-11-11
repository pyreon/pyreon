import { el } from '../../kit'

/**
 * A tab (`.app-tabs button`): fog text, ivory when selected on the raised
 * surface with an inset hairline.
 */
export const SegBtn = el
  .attrs({
    tag: 'button',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 6,
  })
  .theme((t) => ({
    font: 'inherit',
    fontSize: t.size.body,
    cursor: 'pointer',
    border: 'none',
    flex: 'none',
    whiteSpace: 'nowrap',
    height: '30px',
    padding: '0 11px',
    borderRadius: t.radius.button,
    transition: `color ${t.motion.base},background ${t.motion.base}`,
    color: t.faint,
    background: 'transparent',
    hover: { color: t.text },
  }))
  .states((t) => ({
    active: {
      color: t.text,
      backgroundColor: t.surface2,
      boxShadow: `inset 0 0 0 1px ${t.border}`,
    },
    idle: {},
  }))
  // A panel tab that APPLIES to the selected component reads in the mid ink;
  // one with nothing for it stays in the faint ink — present, focusable,
  // visibly secondary, and still 4.5:1 (no opacity).
  .variants((t) => ({
    applicable: { color: t.muted },
    inapplicable: {},
  }))
  // `small` — the panel tab strip, 28px rows.
  .sizes((t) => ({
    small: { height: '28px', fontSize: t.size.small },
    normal: {},
  }))
