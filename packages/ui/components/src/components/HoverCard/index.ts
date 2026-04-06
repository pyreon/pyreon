import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { hoverCardTheme } from './theme'

const HoverCard = createComponent('HoverCard', Element, hoverCardTheme, { tag: 'div' })
export default HoverCard
