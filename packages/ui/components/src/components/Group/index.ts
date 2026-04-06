import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { groupTheme } from './theme'

const Group = createComponent('Group', Element, groupTheme, { tag: 'div', direction: 'inline', block: true })
export default Group
