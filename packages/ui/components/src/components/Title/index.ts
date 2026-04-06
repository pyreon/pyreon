import { Text } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { titleTheme } from './theme'

const Title = createComponent('Title', Text, titleTheme, { tag: 'h2' })
export default Title
