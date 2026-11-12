import { txt } from '../../kit'

export const NewTag = txt.attrs({ tag: 'span' }).theme((t) => ({
  fontFamily: t.font.mono,
  fontSize: t.size.nano,
  letterSpacing: t.tracking.md,
  padding: '1px 6px',
  borderRadius: t.radius.pill,
  border: `1px solid color-mix(in srgb, ${t.accent} 45%, transparent)`,
  color: t.accent,
  background: t.glow,
}))
