import { disabledState, el, focusRing } from '../../factory'

const NavLink = el
  .config({ name: 'NavLink' })
  // The a11y state defaults ride the .attrs() CALLBACK form (the Alert
  // severity pattern): `state="active"` announces aria-current="page" (was
  // visual-only — AT never heard which nav item is current), and
  // `state="disabled"` carries aria-disabled + drops the anchor out of the
  // tab order (pointerEvents:'none' alone left a keyboard-focusable,
  // Enter-activatable "disabled" link). STRING aria values; direct props win.
  .attrs<{ state?: 'active' | 'disabled' }>((props) => ({
    tag: 'a',
    direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center',
    alignY: 'center',
    gap: 6,
    'aria-current': props.state === 'active' ? ('page' as const) : undefined,
    'aria-disabled': props.state === 'disabled' ? ('true' as const) : undefined,
    tabIndex: props.state === 'disabled' ? -1 : undefined,
  }))
  .theme((t) => ({
    // Touch-target floor (code-style: interactive nav items need ≥8px-vertical
    // equivalent) — compact paddings + the MultiSelect minHeight pattern.
    minHeight: 32,
    paddingTop: t.spacing.xxSmall,
    paddingBottom: t.spacing.xxSmall,
    paddingLeft: t.spacing.small,
    paddingRight: t.spacing.small,
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
