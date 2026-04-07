import { rs } from '../../factory'
import { RadioBase, RadioGroupBase } from '@pyreon/ui-primitives'

const Radio = rs({ name: 'Radio', component: RadioBase })
  .theme((t) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: t.spacing.xxSmall,
    cursor: 'pointer',
    color: t.color.system.base[700],
    fontSize: t.fontSize.small,
    transition: t.transition.fast,
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
      borderRadius: t.borderRadius.pill,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  }))
  .sizes((t) => ({
    small: { fontSize: t.fontSize.xSmall, gap: t.spacing.xxSmall },
    medium: { fontSize: t.fontSize.small, gap: t.spacing.xxSmall },
    large: { fontSize: t.fontSize.base, gap: t.spacing.xSmall },
  }))

export default Radio

export const RadioGroup = rs({ name: 'RadioGroup', component: RadioGroupBase })
  .theme((t) => ({
    display: 'flex',
    gap: t.spacing.xSmall,
  }))
  .variants((t) => ({
    vertical: {
      flexDirection: 'column',
      gap: t.spacing.xxSmall,
    },
    horizontal: {
      flexDirection: 'row',
      gap: t.spacing.small,
    },
  }))
