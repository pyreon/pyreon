import { Text } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { highlightTheme } from './theme'

const Highlight = createComponent('Highlight', Text, highlightTheme, { tag: 'span' })
export default Highlight
