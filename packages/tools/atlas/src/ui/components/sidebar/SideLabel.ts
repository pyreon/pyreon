import { txt } from '../../kit'

export const SideLabel = txt
  .attrs({
    tag: 'span',
  })
  // The shared EYEBROW style (the profile menu's section labels use the same
  // one) — mono-lowercase here and ALL-CAPS there read as two design systems.
  .theme((t) => ({
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.sm,
    color: t.muted,
  }))
