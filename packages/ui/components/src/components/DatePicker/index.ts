import { disabledState, el, focusRingTone, tones } from '../../factory'

const DatePicker = el
  .config({ name: 'DatePicker' })
  .attrs({ tag: 'div' })
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

export default DatePicker
