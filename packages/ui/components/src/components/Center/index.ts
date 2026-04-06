import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { centerTheme } from './theme'

const Center = createComponent('Center', Element, centerTheme, { tag: 'div', alignX: 'center', alignY: 'center', block: true })
export default Center
