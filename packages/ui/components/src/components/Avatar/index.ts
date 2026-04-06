import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { avatarTheme, avatarGroupTheme } from './theme'

const Avatar = createComponent('Avatar', Element, avatarTheme, { tag: 'div', alignX: 'center', alignY: 'center' })
export default Avatar

export const AvatarGroup = createComponent('AvatarGroup', Element, avatarGroupTheme, { tag: 'div', direction: 'inline', alignY: 'center' })
