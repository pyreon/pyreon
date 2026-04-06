import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { tooltipTheme } from './theme'

const Tooltip = createComponent('Tooltip', Element, tooltipTheme, { tag: 'div' })
export default Tooltip
