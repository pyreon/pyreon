import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { inputTheme, textareaTheme } from './theme'

const Input = createComponent('Input', Element, inputTheme, { tag: 'input', block: true })
export default Input

export const Textarea = createComponent('Textarea', Element, textareaTheme, { tag: 'textarea', block: true })
