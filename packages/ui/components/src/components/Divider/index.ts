import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { dividerTheme } from './theme'

const Divider = createComponent('Divider', Element, dividerTheme, { tag: 'hr' })
export default Divider
