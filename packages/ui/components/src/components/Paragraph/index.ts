import { Text } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { paragraphTheme } from './theme'

const Paragraph = createComponent('Paragraph', Text, paragraphTheme, { tag: 'p' })
export default Paragraph
