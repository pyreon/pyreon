import { el, type T } from '../../kit'

/** The bottom sheet's header — grab bar + title + close. */
export const SheetHead = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', contentAlignX: 'spaceBetween' })
  .theme((t: T) => ({
    flex: 'none',
    padding: '12px 16px 4px',
    fontSize: t.size.caption,
    fontWeight: '700',
    letterSpacing: t.tracking.sm,
    color: t.muted,
    extendCss: `position:relative;&::before{content:'';position:absolute;top:6px;left:50%;width:36px;height:4px;margin-left:-18px;border-radius:4px;background:${t.border};}`,
  }))
