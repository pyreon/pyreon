import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { actionIconTheme } from './theme'

const ActionIcon = createComponent('ActionIcon', Element, actionIconTheme, { tag: 'button' })
export default ActionIcon
