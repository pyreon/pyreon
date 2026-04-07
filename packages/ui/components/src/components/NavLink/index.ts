import { el } from '../../factory'

const NavLink = el
  .config({ name: 'NavLink' })
  .attrs({ tag: 'a' })
  .theme((t) => ({
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing.xSmall,
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
    hover: { backgroundColor: t.color.system.base[100] },
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
    active: {
      backgroundColor: t.color.system.primary[50],
      color: t.color.system.primary[700],
    },
  }))

export default NavLink
