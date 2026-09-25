import { txt, type T } from '../../kit'

/**
 * The dialog's `esc` badge. The top bar's `Kbd` is absolutely positioned
 * inside its trigger; reused here it overlapped the input and the focus ring.
 */
export const SearchEsc = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    flex: 'none',
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    padding: '1px 8px',
    borderRadius: t.radius.chip,
    color: t.faint,
    border: t.hairline,
    extendCss: '@media (pointer:coarse){display:none;}',
  }))
