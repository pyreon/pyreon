import { Text } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { codeTheme } from './theme'

const Code = createComponent('Code', Text, codeTheme, { tag: 'code' })
export default Code
