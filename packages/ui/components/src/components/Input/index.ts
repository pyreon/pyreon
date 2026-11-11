import { disabledState, el, focusRingTone, tones } from '../../factory'

const Input = el
  .config({ name: 'Input' })
  .attrs<{
    placeholder?: string
    type?: string
    value?: string | number
    onInput?: (e: Event) => void
    onChange?: (e: Event) => void
    disabled?: boolean
    readOnly?: boolean
    name?: string
    autoComplete?: string
    autoFocus?: boolean
    maxLength?: number
    minLength?: number
    pattern?: string
    required?: boolean
  }>({ tag: 'input', block: true })
  .theme((t, m) => ({
    width: '100%',
    backgroundColor: tones(t, m).surface,
    color: tones(t, m).text,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: tones(t, m).border,
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    transition: t.transition.fast,
    outline: 'none',
    focus: { ...focusRingTone(t, 'primary'), borderColor: t.color.system.primary.base },
    disabled: { ...disabledState(), backgroundColor: t.color.system.base[50] },
    placeholder: {
      color: tones(t, m).placeholder,
    },
  }))
  .states((t) => ({
    error: {
      borderColor: t.color.system.error.base,
      focus: focusRingTone(t, 'error'),
    },
    success: {
      borderColor: t.color.system.success.base,
      focus: focusRingTone(t, 'success'),
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.small,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.base,
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xSmall,
      paddingBottom: t.spacing.xSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
      borderRadius: t.borderRadius.medium,
    },
  }))
  .variants((t, m) => ({
    outline: {},
    filled: {
      backgroundColor: t.color.system.base[100],
      borderColor: t.color.system.transparent,
      focus: {
        backgroundColor: tones(t, m).surface,
        borderColor: t.color.system.primary.base,
      },
    },
    underline: {
      borderWidth: 0,
      borderWidthBottom: 2,
      borderStyleBottom: 'solid',
      borderColorBottom: tones(t, m).border,
      borderRadius: 0,
      paddingLeft: 0,
      paddingRight: 0,
      focus: {
        boxShadow: 'none',
        borderColorBottom: t.color.system.primary.base,
      },
    },
  }))

export default Input

export const Textarea = el
  .config({ name: 'Textarea' })
  .attrs<{
    placeholder?: string
    value?: string
    rows?: number
    onInput?: (e: Event) => void
    onChange?: (e: Event) => void
    disabled?: boolean
    readOnly?: boolean
    name?: string
    required?: boolean
    maxLength?: number
  }>({ tag: 'textarea', block: true })
  .theme((t, m) => ({
    width: '100%',
    backgroundColor: tones(t, m).surface,
    color: tones(t, m).text,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: tones(t, m).border,
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    transition: t.transition.fast,
    outline: 'none',
    resize: 'vertical',
    focus: { ...focusRingTone(t, 'primary'), borderColor: t.color.system.primary.base },
    disabled: { ...disabledState(), backgroundColor: t.color.system.base[50] },
    placeholder: {
      color: tones(t, m).placeholder,
    },
  }))
  .states((t) => ({
    error: {
      borderColor: t.color.system.error.base,
      focus: focusRingTone(t, 'error'),
    },
    success: {
      borderColor: t.color.system.success.base,
      focus: focusRingTone(t, 'success'),
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.small,
      minHeight: '60px',
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.base,
      minHeight: '80px',
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xSmall,
      paddingBottom: t.spacing.xSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
      borderRadius: t.borderRadius.medium,
      minHeight: '120px',
    },
  }))
  .variants((t, m) => ({
    outline: {},
    filled: {
      backgroundColor: t.color.system.base[100],
      borderColor: t.color.system.transparent,
      focus: {
        backgroundColor: tones(t, m).surface,
        borderColor: t.color.system.primary.base,
      },
    },
    underline: {
      borderWidth: 0,
      borderWidthBottom: 2,
      borderStyleBottom: 'solid',
      borderColorBottom: tones(t, m).border,
      borderRadius: 0,
      paddingLeft: 0,
      paddingRight: 0,
      focus: {
        boxShadow: 'none',
        borderColorBottom: t.color.system.primary.base,
      },
    },
  }))
