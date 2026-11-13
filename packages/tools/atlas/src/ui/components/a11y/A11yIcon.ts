import { el } from '../../kit'

/**
 * A row's status mark — an outlined chip in the status colour (`.chip2.ok`
 * etc.), never white on a fill (white on the light-mode ok green is fine, on
 * the dark-mode one it is not).
 */
export const A11yIcon = el
  .attrs({
    tag: 'span',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t) => ({
    width: '22px',
    height: '22px',
    flex: 'none',
    borderRadius: t.radius.pill,
    fontFamily: t.font.mono,
    fontSize: t.size.small,
    border: '1px solid currentColor',
    color: t.faint,
  }))
  .states((t) => ({
    ok: { color: t.ok },
    warn: { color: t.warn },
    danger: { color: t.danger },
    unknown: { color: t.faint },
  }))
