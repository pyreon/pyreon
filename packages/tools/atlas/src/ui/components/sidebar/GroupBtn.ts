/** A collapsible hierarchy group header — indented by `data-depth` via padding steps. */
import { el, type T } from '../../kit'

export const GroupBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    font: 'inherit',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    margin: '8px 0 4px',
    padding: '2px 8px',
    borderRadius: t.radius.control,
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.xs,
    color: t.muted,
    background: 'transparent',
    hover: { background: t.surface2 },
    extendCss: `&[data-depth="1"]{margin-left:12px;} &[data-depth="2"]{margin-left:24px;} &[data-depth="3"]{margin-left:36px;}`,
  }))
