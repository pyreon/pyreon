import { el } from '../../factory'

const NumberInput = el
  .config({ name: 'NumberInput' })
  .attrs({ tag: 'input', block: true })
  .theme((t) => ({
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
    focus: {
      borderColor: t.color.system.primary.base,
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      backgroundColor: t.color.system.base[50],
    },
    placeholder: {
      color: t.color.system.base[400],
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

export default NumberInput
