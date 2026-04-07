import { rs } from '../../factory'
import { CheckboxBase } from '@pyreon/ui-primitives'


const Checkbox = rs({ name: 'Checkbox', component: CheckboxBase })
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
      borderRadius: t.borderRadius.small,
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

export default Checkbox
