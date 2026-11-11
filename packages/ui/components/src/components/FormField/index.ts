import { el, tones, toneText, txt } from '../../factory'

const FormField = el
  .config({ name: 'FormField' })
  .attrs({ tag: 'div', direction: 'rows',
    contentDirection: 'rows',
    contentAlignX: 'left',
    contentAlignY: 'center', block: true, gap: 1 })

export default FormField

export const FieldLabel = txt
  .config({ name: 'FieldLabel' })
  .attrs({ tag: 'label' })
  .theme((t, m) => ({
    fontSize: t.fontSize.small,
    fontWeight: t.fontWeight.medium,
    color: tones(t, m).textMuted,
  }))
  .sizes((t) => ({
    small: { fontSize: t.fontSize.xSmall },
    medium: { fontSize: t.fontSize.small },
    large: { fontSize: t.fontSize.base },
  }))

export const FieldError = txt
  .config({ name: 'FieldError' })
  .attrs({ tag: 'span' })
  .theme((t, m) => ({
    fontSize: t.fontSize.xSmall,
    // error.base (red-500) is 3.8:1 on white: use the legible status text tone.
    color: toneText(t, m, 'error'),
  }))

export const FieldDescription = txt
  .config({ name: 'FieldDescription' })
  .attrs({ tag: 'span' })
  .theme((t, m) => ({
    fontSize: t.fontSize.xSmall,
    color: tones(t, m).textMuted,
  }))
