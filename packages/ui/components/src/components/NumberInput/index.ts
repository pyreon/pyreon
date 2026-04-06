import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { numberInputTheme } from './theme'

const NumberInput = createComponent('NumberInput', Element, numberInputTheme, { tag: 'input', block: true })
export default NumberInput
