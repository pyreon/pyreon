import { el } from '../../factory'

const Stepper = el
  .config({ name: 'Stepper' })
  .attrs({ tag: 'div' })
  .theme((t: any) => ({
    display: 'flex',
    gap: t.spacing.xxSmall,
  }))
  .variants(() => ({
    horizontal: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    vertical: {
      flexDirection: 'column',
    },
  }))

export default Stepper

export const Step = el
  .config({ name: 'Step' })
  .attrs({ tag: 'div' })
  .theme((t: any) => ({
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing.xxSmall,
    fontSize: t.fontSize.small,
    color: t.color.system.base[500],
    transition: t.transition.fast,
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
      borderRadius: t.borderRadius.small,
    },
  }))
  .states((t: any) => ({
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
