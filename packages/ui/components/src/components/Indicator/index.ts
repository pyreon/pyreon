import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { indicatorTheme } from './theme'

const Indicator = createComponent('Indicator', Element, indicatorTheme, { tag: 'span' })
export default Indicator
