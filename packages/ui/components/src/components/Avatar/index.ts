import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { avatarTheme, avatarGroupTheme } from './theme'

const resolved = getComponentTheme(avatarTheme)

const Avatar = rocketstyle({ useBooleans: true })({ name: 'Avatar', component: Element })
  .attrs({ tag: 'div', alignX: 'center', alignY: 'center' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)
  .variants(resolved.variants)

export default Avatar

const agResolved = getComponentTheme(avatarGroupTheme)

export const AvatarGroup = rocketstyle({ useBooleans: true })({ name: 'AvatarGroup', component: Element })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center' } as any)
  .theme(agResolved.base)
