import { el } from '../../kit'

export const SegBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t) => ({
    font: 'inherit',
    fontSize: t.size.input,
    fontWeight: '600',
    cursor: 'pointer',
    border: 'none',
    flex: 'none',
    whiteSpace: 'nowrap',
    padding: '8px 16px',
    borderRadius: t.radius.button,
    transition: `all ${t.motion.base}`,
    color: t.muted,
    background: 'transparent',
  }))
  .states(
    (t) => ({
      active: {
        color: t.text,
        backgroundColor: t.bg,
        boxShadow: '0 1px 3px rgba(15,18,30,.12)',
      },
      idle: {},
    }),
  )
  // `inapplicable` — an addon tab with nothing for the selected component:
  // present, focusable, visibly secondary.
  .variants(() => ({
    inapplicable: { opacity: '0.45' },
    applicable: {},
  }))
  // `small` — the addon tab strip and the compact top bar, where the full
  // size cannot fit a single row.
  .sizes(
    (t) => ({
      small: { padding: '6px 10px', fontSize: t.size.body },
      normal: {},
    }),
  )
