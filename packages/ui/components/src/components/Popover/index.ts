import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { popoverTheme } from './theme'

const Popover = createComponent('Popover', Element, popoverTheme, { tag: 'div' })
export default Popover
