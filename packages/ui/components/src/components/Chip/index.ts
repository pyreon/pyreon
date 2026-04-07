import { el } from '../../factory'

const Chip = el
  .config({ name: 'Chip' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', gap: 1 })
  .theme((t) => ({
    fontWeight: t.fontWeight.medium,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: t.transition.fast,
    userSelect: 'none',
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  }))
  .states((t) => ({
    primary: {
      backgroundColor: t.color.system.primary[100],
      color: t.color.system.primary[700],
      hover: {
        backgroundColor: t.color.system.primary[200],
      },
    },
    secondary: {
      backgroundColor: t.color.system.base[100],
      color: t.color.system.base[700],
      hover: {
        backgroundColor: t.color.system.base[200],
      },
    },
    success: {
      backgroundColor: t.color.system.success[100],
      color: t.color.system.success[700],
      hover: {
        backgroundColor: t.color.system.success[200],
      },
    },
    error: {
      backgroundColor: t.color.system.error[100],
      color: t.color.system.error[700],
      hover: {
        backgroundColor: t.color.system.error[200],
      },
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xxSmall,
      paddingRight: t.spacing.xxSmall,
      borderRadius: t.borderRadius.small,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.base,
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
      borderRadius: t.borderRadius.medium,
    },
  }))
  .variants(() => ({
    filled: {},
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'solid',
    },
  }))

export default Chip
