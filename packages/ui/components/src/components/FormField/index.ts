import { Element, Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

/** Groups a label, input, error message, and description into a form field. */
const FormField = rocketstyle({ useBooleans: true })({ name: 'FormField', component: Element })
  .attrs({ tag: 'div', direction: 'rows', block: true } as any)
  .theme({
    gap: 4,
  })
  .states({
    error: { color: '#ef4444' },
  })

export default FormField

/** Label for a form field. */
export const FieldLabel = rocketstyle({ useBooleans: true })({ name: 'FieldLabel', component: Text })
  .attrs({ tag: 'label' } as any)
  .theme({
    fontSize: 14,
    fontWeight: 500,
    color: '#374151',
    lineHeight: 1.5,
  })
  .sizes({
    sm: { fontSize: 12 },
    md: { fontSize: 14 },
    lg: { fontSize: 16 },
  })

/** Error message for a form field. */
export const FieldError = rocketstyle()({ name: 'FieldError', component: Text })
  .attrs({ tag: 'span' } as any)
  .theme({
    fontSize: 12,
    color: '#ef4444',
    lineHeight: 1.5,
  })

/** Helper description for a form field. */
export const FieldDescription = rocketstyle()({ name: 'FieldDescription', component: Text })
  .attrs({ tag: 'span' } as any)
  .theme({
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 1.5,
  })
