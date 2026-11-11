import { txt } from '../../kit'

/** A keyboard shortcut hint. Noise on a touch screen, so hidden there. */
export const Kbd = txt.attrs({ tag: 'kbd' }).theme((t) => ({
  fontFamily: t.font.mono,
  fontSize: t.size.label,
  padding: '1px 5px',
  borderRadius: '5px',
  border: `1px solid ${t.border2}`,
  color: t.muted,
  background: t.surface2,
  extendCss: '@media (pointer:coarse){display:none;}',
}))
