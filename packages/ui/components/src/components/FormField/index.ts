import { Element, Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { formFieldTheme, fieldLabelTheme, fieldErrorTheme, fieldDescriptionTheme } from './theme'

const ffResolved = getComponentTheme(formFieldTheme)

const FormField = rocketstyle({ useBooleans: true })({ name: 'FormField', component: Element })
  .attrs({ tag: 'div', direction: 'rows', block: true } as any)
  .theme(ffResolved.base)

export default FormField

const flResolved = getComponentTheme(fieldLabelTheme)

export const FieldLabel = rocketstyle({ useBooleans: true })({ name: 'FieldLabel', component: Text })
  .attrs({ tag: 'label' } as any)
  .theme(flResolved.base)

const feResolved = getComponentTheme(fieldErrorTheme)

export const FieldError = rocketstyle()({ name: 'FieldError', component: Text })
  .attrs({ tag: 'span' } as any)
  .theme(feResolved.base)

const fdResolved = getComponentTheme(fieldDescriptionTheme)

export const FieldDescription = rocketstyle()({ name: 'FieldDescription', component: Text })
  .attrs({ tag: 'span' } as any)
  .theme(fdResolved.base)
