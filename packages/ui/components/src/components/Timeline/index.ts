import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { timelineTheme } from './theme'

const Timeline = createComponent('Timeline', Element, timelineTheme, { tag: 'div', direction: 'rows' })
export default Timeline
