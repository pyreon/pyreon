import { el, focusRing } from '../../factory'

const Stepper = el
  .config({ name: 'Stepper' })
  // An ORDERED LIST — steps are inherently sequenced, so AT announces
  // "list, N items" + position (WCAG 1.3.1 structure).
  .attrs({ tag: 'ol', direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center', alignY: 'center', gap: 2 })
  .theme(() => ({
    listStyle: 'none',
    margin: 0,
    padding: 0,
  }))
  .variants(() => ({
    horizontal: {},
    vertical: {
      flexDirection: 'column',
    },
  }))

export default Stepper

export const Step = el
  .config({ name: 'Step' })
  // `<li>` inside the Stepper `<ol>`; the ACTIVE step announces
  // `aria-current="step"` (the .attrs() callback form — Breadcrumb/NavLink
  // precedent). `completed` keeps its state styling; pair it with a ✓ glyph
  // in content for a non-color signal.
  .attrs<{ state?: 'active' | 'completed' }>((props) => ({
    tag: 'li',
    direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center',
    alignY: 'center',
    gap: 2,
    'aria-current': props.state === 'active' ? ('step' as const) : undefined,
  }))
  .theme((t) => ({
    fontSize: t.fontSize.small,
    color: t.color.system.base[500],
    transition: t.transition.fast,
    focus: { ...focusRing(t), borderRadius: t.borderRadius.small },
  }))
  .states((t) => ({
    active: {
      backgroundColor: t.color.system.primary.base,
      color: t.color.system.light.base,
      borderRadius: t.borderRadius.pill,
    },
    completed: {
      backgroundColor: t.color.system.success.base,
      color: t.color.system.light.base,
      borderRadius: t.borderRadius.pill,
    },
    default: {
      backgroundColor: t.color.system.base[200],
      color: t.color.system.base[600],
      borderRadius: t.borderRadius.pill,
    },
  }))
