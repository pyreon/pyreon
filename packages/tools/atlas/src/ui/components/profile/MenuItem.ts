import { dim, el, type T } from '../../kit'

export const MenuItem = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 8, block: true })
  .states(
    dim((t) => ({
      active: { color: t.text, background: t.accentSoft },
      idle: { color: t.muted, background: 'transparent', hover: { background: t.surface2 } },
    })),
  )
  .theme((t: T) => ({
    font: 'inherit', cursor: 'pointer', textAlign: 'left', border: 'none',
    // In the THEME (not only the state dims): a MenuItem rendered without a
    // `state` prop must not fall back to the UA button background.
    background: 'transparent', color: t.muted,
    padding: '8px', borderRadius: t.radius.button, fontSize: t.size.text,
    hover: { background: t.surface2 },
  }))
