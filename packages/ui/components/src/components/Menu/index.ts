import { disabledState, el } from '../../factory'

const Menu = el
  .config({ name: 'Menu' })
  .attrs({ tag: 'div', direction: 'rows',
    contentDirection: 'rows',
    contentAlignX: 'left',
    contentAlignY: 'center', block: true })
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
  .attrs({ tag: 'div', direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center', alignY: 'center', block: true })
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
    disabled: { ...disabledState(), pointerEvents: 'none' },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      // Compact paddings BUT a touch-target floor: the code-style minimum for
      // menu items is spacing.small vertical / medium horizontal — met here
      // via minHeight (the MultiSelect pattern: tiny padding + a 32px floor)
      // plus horizontal padding at the documented medium minimum.
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.medium,
      paddingRight: t.spacing.medium,
      minHeight: 32,
    },
    medium: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.small,
      paddingBottom: t.spacing.small,
      paddingLeft: t.spacing.medium,
      paddingRight: t.spacing.medium,
    },
  }))
