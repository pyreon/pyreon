import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { stackTheme } from './theme'

const Stack = createComponent('Stack', Element, stackTheme, { tag: 'div', direction: 'rows', block: true })
export default Stack
