import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { cardTheme } from './theme'

const Card = createComponent('Card', Element, cardTheme, { tag: 'div', direction: 'rows', block: true })
export default Card
