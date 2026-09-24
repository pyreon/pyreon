import { txt, type T } from '../../kit'

export const MenuLabel = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    // Same eyebrow style as the sidebar head (see SideLabel).
    fontSize: t.size.caption, fontWeight: '700', letterSpacing: t.tracking.sm,
    color: t.muted, padding: '8px 8px 4px',
  }))
