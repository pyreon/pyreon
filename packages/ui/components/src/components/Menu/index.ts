import { el } from '../../factory'

const Menu = el
  .config({ name: 'Menu' })
  .attrs({ tag: 'div', direction: 'rows', block: true })
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
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', block: true })
  .theme((t) => ({
    cursor: 'pointer',
    borderRadius: t.borderRadius.small,
    color: t.color.system.base[700],
    transition: t.transition.fast,
    fontSize: t.fontSize.base,
    paddingTop: t.spacing.small,
    paddingBottom: t.spacing.small,
    paddingLeft: t.spacing.medium,
    paddingRight: t.spacing.medium,
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
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
    },
    medium: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.small,
      paddingBottom: t.spacing.small,
      paddingLeft: t.spacing.medium,
      paddingRight: t.spacing.medium,
    },
  }))
