import { Text } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { badgeTheme } from './theme'

const Badge = createComponent('Badge', Text, badgeTheme, { tag: 'span' })
export default Badge
