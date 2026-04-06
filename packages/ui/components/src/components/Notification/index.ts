import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { notificationTheme } from './theme'

const Notification = createComponent('Notification', Element, notificationTheme, { tag: 'div', direction: 'rows', block: true })
export default Notification
