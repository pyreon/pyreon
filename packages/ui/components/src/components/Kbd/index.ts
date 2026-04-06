import { Text } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { kbdTheme } from './theme'

const Kbd = createComponent('Kbd', Text, kbdTheme, { tag: 'kbd' })
export default Kbd
