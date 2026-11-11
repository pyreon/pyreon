import { disabledState, el, focusRingTone, tones } from '../../factory'
import { ComboboxBase } from '@pyreon/ui-primitives'

const MultiSelect = el.config({ name: 'MultiSelect', component: ComboboxBase })
  .attrs({ multiple: true })
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
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: t.spacing.xxxSmall,
    focus: { ...focusRingTone(t, 'primary'), borderColor: t.color.system.primary.base },
    disabled: { ...disabledState(), backgroundColor: t.color.system.base[50] },
    placeholder: {
      color: tones(t, m).placeholder,
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      minHeight: '32px',
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.small,
    },
    medium: {
      fontSize: t.fontSize.small,
      minHeight: '40px',
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.base,
    },
    large: {
      fontSize: t.fontSize.base,
      minHeight: '48px',
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
      borderRadius: t.borderRadius.medium,
    },
  }))

export default MultiSelect
