import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { alertTheme } from './theme'

const Alert = createComponent('Alert', Element, alertTheme, { tag: 'div', direction: 'inline', alignY: 'center', block: true })
export default Alert
