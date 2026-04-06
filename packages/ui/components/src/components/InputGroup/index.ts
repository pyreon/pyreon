import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { inputGroupTheme } from './theme'

const InputGroup = createComponent('InputGroup', Element, inputGroupTheme, { tag: 'div' })
export default InputGroup
