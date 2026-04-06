import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { boxTheme } from './theme'

const Box = createComponent('Box', Element, boxTheme, { tag: 'div' })
export default Box
