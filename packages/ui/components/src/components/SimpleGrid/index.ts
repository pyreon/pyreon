import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { simpleGridTheme } from './theme'

const SimpleGrid = createComponent('SimpleGrid', Element, simpleGridTheme, { tag: 'div' })
export default SimpleGrid
