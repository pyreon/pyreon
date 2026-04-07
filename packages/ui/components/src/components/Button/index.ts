import { el } from '../../factory'

const Button = el
  .config({ name: 'Button' })
  .attrs({ tag: 'button', direction: 'inline', alignX: 'center', alignY: 'center', gap: 8 })
  .theme((t) => ({
    fontSize: t.fontSize.base,
    fontWeight: t.fontWeight.medium,
    lineHeight: t.lineHeight.base,
    borderRadius: t.borderRadius.base,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.transparent,
    cursor: 'pointer',
    transition: t.transition.base,
    whiteSpace: 'nowrap',
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
    active: {
      transform: 'scale(0.98)',
    },
  }))
  .states((t) => ({
    primary: {
      backgroundColor: t.color.system.primary.base,
      color: t.color.system.light.base,
      hover: {
        backgroundColor: t.color.system.primary[800],
      },
    },
    secondary: {
      backgroundColor: t.color.system.base[100],
      color: t.color.system.dark[800],
      hover: {
        backgroundColor: t.color.system.base[200],
      },
    },
    danger: {
      backgroundColor: t.color.system.error.base,
      color: t.color.system.light.base,
      hover: {
        backgroundColor: t.color.system.error[800],
      },
    },
    success: {
      backgroundColor: t.color.system.success.base,
      color: t.color.system.light.base,
      hover: {
        backgroundColor: t.color.system.success[800],
      },
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xSmall,
      paddingBottom: t.spacing.xSmall,
      paddingLeft: t.spacing.medium,
      paddingRight: t.spacing.medium,
    },
    medium: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.small,
      paddingBottom: t.spacing.small,
      paddingLeft: t.spacing.large,
      paddingRight: t.spacing.large,
    },
    large: {
      fontSize: t.fontSize.medium,
      paddingTop: t.spacing.medium,
      paddingBottom: t.spacing.medium,
      paddingLeft: t.spacing.xLarge,
      paddingRight: t.spacing.xLarge,
    },
  }))
  .variants((t) => ({
    solid: {},
    outline: {
      backgroundColor: t.color.system.transparent,
      borderColor: t.color.system.primary.base,
      color: t.color.system.primary.text,
      hover: {
        backgroundColor: t.color.system.primary[50],
      },
    },
    subtle: {
      backgroundColor: t.color.system.primary[100],
      color: t.color.system.primary.text,
      hover: {
        backgroundColor: t.color.system.primary[200],
      },
    },
    ghost: {
      backgroundColor: t.color.system.transparent,
      color: t.color.system.primary.text,
      hover: {
        backgroundColor: t.color.system.base[50],
      },
    },
    link: {
      backgroundColor: t.color.system.transparent,
      color: t.color.system.primary.text,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      textDecoration: 'underline',
    },
  }))

export default Button

export const IconButton = el
  .config({ name: 'IconButton' })
  .attrs({ tag: 'button', direction: 'inline', alignX: 'center', alignY: 'center' })
  .theme((t) => ({
    backgroundColor: t.color.system.transparent,
    color: t.color.system.base[600],
    borderRadius: t.borderRadius.base,
    borderWidth: 0,
    cursor: 'pointer',
    transition: t.transition.base,
    padding: t.spacing.small,
    hover: {
      backgroundColor: t.color.system.base[50],

      color: t.color.system.dark.base,
    },
    focus: { boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`, outline: 'none' },
    disabled: {
      opacity: 0.5,

      cursor: 'not-allowed',
    },
  }))
  .sizes((t) => ({
    small: { padding: t.spacing.xSmall },
    medium: { padding: t.spacing.small },
    large: { padding: t.spacing.medium },
  }))

export const CloseButton = el
  .config({ name: 'CloseButton' })
  .attrs({ tag: 'button', 'aria-label': 'Close', direction: 'inline', alignX: 'center', alignY: 'center' })
  .theme((t) => ({
    backgroundColor: t.color.system.transparent,
    color: t.color.system.base[400],
    borderRadius: t.borderRadius.small,
    borderWidth: 0,
    cursor: 'pointer',
    transition: t.transition.fast,
    padding: t.spacing.xxSmall,
    hover: {
      backgroundColor: t.color.system.base[50],

      color: t.color.system.dark[700],
    },
    focus: { boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`, outline: 'none' },
    disabled: {
      opacity: 0.5,

      cursor: 'not-allowed',
    },
  }))
  .sizes((t) => ({
    small: { padding: t.spacing.xxxSmall },
    medium: { padding: t.spacing.xxSmall },
    large: { padding: t.spacing.xSmall },
  }))
