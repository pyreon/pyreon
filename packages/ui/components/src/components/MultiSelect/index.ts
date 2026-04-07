import rocketstyle from '@pyreon/rocketstyle'
import { ComboboxBase } from '@pyreon/ui-primitives'

const rs = rocketstyle({ useBooleans: true })

const MultiSelect = rs({ name: 'MultiSelect', component: ComboboxBase })
  .theme((t: any) => ({
    width: '100%',
    backgroundColor: t.color.system.light.base,
    color: t.color.system.dark[800],
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[300],
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    transition: t.transition.fast,
    outline: 'none',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: t.spacing.xxxSmall,
    focus: {
      borderColor: t.color.system.primary.base,
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      backgroundColor: t.color.system.base[50],
    },
    placeholder: { color: t.color.system.base[400] },
  }))
  .sizes((t: any) => ({
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
