import { Element, Text } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { formFieldTheme, fieldLabelTheme, fieldErrorTheme, fieldDescriptionTheme } from './theme'

const FormField = createComponent('FormField', Element, formFieldTheme, { tag: 'div', direction: 'rows', block: true })
export default FormField

export const FieldLabel = createComponent('FieldLabel', Text, fieldLabelTheme, { tag: 'label' })
export const FieldError = createComponent('FieldError', Text, fieldErrorTheme, { tag: 'span' })
export const FieldDescription = createComponent('FieldDescription', Text, fieldDescriptionTheme, { tag: 'span' })
