import { el, focusRing } from '../../factory'

const Stepper = el
  .config({ name: 'Stepper' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', gap: 2 })
  .theme(() => ({}))
  .variants(() => ({
    horizontal: {},
    vertical: {
      flexDirection: 'column',
    },
  }))

export default Stepper

export const Step = el
  .config({ name: 'Step' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', gap: 2 })
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
