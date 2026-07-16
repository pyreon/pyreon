import { disabledState, el, focusRing } from '../../factory'

const NavLink = el
  .config({ name: 'NavLink' })
  .attrs({ tag: 'a', direction: 'inline', alignY: 'center', gap: 6 })
  .theme((t) => ({
    paddingTop: t.spacing.xxSmall,
    paddingBottom: t.spacing.xxSmall,
    paddingLeft: t.spacing.xSmall,
    paddingRight: t.spacing.xSmall,
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    color: t.color.system.base[700],
    textDecoration: 'none',
    cursor: 'pointer',
    transition: t.transition.fast,
    hover: {
      backgroundColor: t.color.system.base[100],
    },
    focus: focusRing(t),
    disabled: { ...disabledState(), pointerEvents: 'none' },
  }))
  .states((t) => ({
    active: {
      backgroundColor: t.color.system.primary[50],
      color: t.color.system.primary[700],
    },
  }))

export default NavLink
