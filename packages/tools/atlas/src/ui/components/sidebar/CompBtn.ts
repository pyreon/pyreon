import { el } from '../../kit'

export const CompBtn = el
  .attrs({
    tag: 'button',
    contentDirection: 'inline',
    contentAlignY: 'center',
    block: true,
    gap: 12,
  })
  .theme((t) => ({
    font: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    border: 'none',
    padding: '8px 8px',
    borderRadius: t.radius.button,
    marginBottom: '1px',
    fontSize: t.size.item,
    transition: `background ${t.motion.fast}`,
    fontWeight: '500',
    color: t.muted,
    background: 'transparent',
    hover: { background: t.surface2 },
    minWidth: '0',
    // Nesting depth → indent. A part sits under its parent, a folder's
    // components under the folder header.
    extendCss:
      '&[data-depth="2"]{padding-left:20px;}&[data-depth="3"]{padding-left:32px;}&[data-depth="4"]{padding-left:44px;}',
  }))
  .states(
    (t) => ({
      active: {
        fontWeight: 600,
        color: t.text,
        backgroundColor: t.accentSoft,
      },
      idle: {},
    }),
  )
