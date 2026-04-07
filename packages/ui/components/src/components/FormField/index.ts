import { el, txt } from '../../factory'

const FormField = el
  .config({ name: 'FormField' })
  .attrs({ tag: 'div', direction: 'rows', block: true, gap: 1 })
  .theme(() => ({}))

export default FormField

export const FieldLabel = txt
  .config({ name: 'FieldLabel' })
  .attrs({ tag: 'label' })
  .theme((t) => ({
    fontSize: t.fontSize.small,
    fontWeight: t.fontWeight.medium,
    color: t.color.system.base[700],
  }))
  .sizes((t) => ({
    small: { fontSize: t.fontSize.xSmall },
    medium: { fontSize: t.fontSize.small },
    large: { fontSize: t.fontSize.base },
  }))

export const FieldError = txt
  .config({ name: 'FieldError' })
  .attrs({ tag: 'span' })
  .theme((t) => ({
    fontSize: t.fontSize.xSmall,
    color: t.color.system.error.base,
  }))

export const FieldDescription = txt
  .config({ name: 'FieldDescription' })
  .attrs({ tag: 'span' })
  .theme((t) => ({
    fontSize: t.fontSize.xSmall,
    color: t.color.system.base[500],
  }))
