import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Avatar = rocketstyle({ useBooleans: true })({ name: 'Avatar', component: Element })
  .attrs({ tag: 'div', alignX: 'center', alignY: 'center' } as any)
  .theme({
    backgroundColor: '#9ca3af',
    color: '#ffffff',
    fontWeight: 600,
    overflow: 'hidden',
    display: 'inline-flex',
    flexShrink: 0,
    userSelect: 'none',
  })
  .sizes({
    xs: { width: 24, height: 24, fontSize: 10 },
    sm: { width: 32, height: 32, fontSize: 12 },
    md: { width: 40, height: 40, fontSize: 14 },
    lg: { width: 48, height: 48, fontSize: 16 },
    xl: { width: 64, height: 64, fontSize: 20 },
  })
  .variants({
    circle: { borderRadius: 9999 },
    rounded: { borderRadius: 8 },
  })

export default Avatar

export const AvatarGroup = rocketstyle({ useBooleans: true })({ name: 'AvatarGroup', component: Element })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center' } as any)
  .theme({
    display: 'inline-flex',
    flexDirection: 'row',
  })
  .sizes({
    xs: { marginLeft: -6 },
    sm: { marginLeft: -8 },
    md: { marginLeft: -10 },
    lg: { marginLeft: -12 },
    xl: { marginLeft: -16 },
  })
