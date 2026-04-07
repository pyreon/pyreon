import { el } from '../../factory'

const Menu = el
  .config({ name: 'Menu' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    backgroundColor: t.color.system.light.base,
    boxShadow: t.shadows.medium,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[200],
    borderRadius: t.borderRadius.medium,
    padding: t.spacing.xxxSmall,
    zIndex: 50,
    minWidth: '160px',
  }))

export default Menu

export const MenuItem = el
  .config({ name: 'MenuItem' })
  .attrs({ tag: 'button' })
  .theme((t) => ({
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing.xxSmall,
    cursor: 'pointer',
    borderRadius: t.borderRadius.small,
    color: t.color.system.base[700],
    transition: t.transition.fast,
    hover: {
      backgroundColor: t.color.system.base[100],
    },
    focus: {
      backgroundColor: t.color.system.base[100],
      outline: 'none',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xxSmall,
      paddingRight: t.spacing.xxSmall,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
    },
  }))
