import { el } from '../../factory'

const ActionIcon = el
  .config({ name: 'ActionIcon' })
  .attrs({ tag: 'button', direction: 'inline', alignX: 'center', alignY: 'center' })
  .theme((t) => ({
    cursor: 'pointer',
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.transparent,
    borderRadius: t.borderRadius.base,
    transition: t.transition.fast,
    hover: {
      transform: 'scale(1.05)',
    },
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
    },
    active: {
      transform: 'scale(0.95)',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
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
      color: t.color.system.base[700],
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
      focus: { boxShadow: `0 0 0 3px ${t.color.system.error[200]}` },
    },
  }))
  .sizes((t) => ({
    xSmall: { width: '24px', height: '24px', fontSize: t.fontSize.xSmall },
    small: { width: '30px', height: '30px', fontSize: t.fontSize.small },
    medium: { width: '36px', height: '36px', fontSize: t.fontSize.base },
    large: { width: '42px', height: '42px', fontSize: t.fontSize.medium },
    xLarge: { width: '48px', height: '48px', fontSize: t.fontSize.large },
  }))
  .variants((t) => ({
    filled: {},
    outline: {
      backgroundColor: t.color.system.transparent,
      borderColor: t.color.system.primary.base,
      color: t.color.system.primary.text,
      hover: {
        backgroundColor: t.color.system.primary[50],
      },
    },
    subtle: {
      backgroundColor: t.color.system.primary[50],
      color: t.color.system.primary.text,
      hover: {
        backgroundColor: t.color.system.primary[100],
      },
    },
    transparent: {
      backgroundColor: t.color.system.transparent,
      color: t.color.system.base[500],
      hover: {
        backgroundColor: t.color.system.base[100],

        color: t.color.system.dark.base,
      },
    },
  }))

export default ActionIcon
