import { el } from '../../factory'

const Avatar = el
  .config({ name: 'Avatar' })
  .attrs({ tag: 'div', alignX: 'center', alignY: 'center' })
  .theme((t) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.color.system.base[200],
    color: t.color.system.base[600],
    fontWeight: t.fontWeight.medium,
    overflow: 'hidden',
    flexShrink: 0,
  }))
  .sizes((t) => ({
    xSmall: { width: '24px', height: '24px', fontSize: t.fontSize.xSmall },
    small: { width: '32px', height: '32px', fontSize: t.fontSize.small },
    medium: { width: '40px', height: '40px', fontSize: t.fontSize.base },
    large: { width: '48px', height: '48px', fontSize: t.fontSize.medium },
    xLarge: { width: '64px', height: '64px', fontSize: t.fontSize.large },
  }))
  .variants((t) => ({
    circle: { borderRadius: t.borderRadius.pill },
    rounded: { borderRadius: t.borderRadius.base },
  }))

export default Avatar

export const AvatarGroup = el
  .config({ name: 'AvatarGroup' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center' })
  .theme((t) => ({
    display: 'inline-flex',
    flexDirection: 'row-reverse',
    gap: `-${t.spacing.xxSmall}`,
  }))
