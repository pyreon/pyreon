import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { chipTheme } from './theme'

const Chip = createComponent('Chip', Element, chipTheme, { tag: 'div' })
export default Chip
