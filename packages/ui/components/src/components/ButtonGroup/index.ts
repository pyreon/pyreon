import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { buttonGroupTheme } from './theme'

const ButtonGroup = createComponent('ButtonGroup', Element, buttonGroupTheme, { tag: 'div' })
export default ButtonGroup
