import { el } from '../../factory'
import { CheckboxBase } from '@pyreon/ui-primitives'

const Checkbox = el.config({ name: 'Checkbox', component: CheckboxBase })
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

export const CheckboxIndicator = el
  .config({ name: 'CheckboxIndicator' })
  .attrs({ tag: 'span' })
  .theme((t) => ({
    width: '18px',
    height: '18px',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: t.color.system.base[300],
    borderRadius: t.borderRadius.small,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.color.system.light.base,
    color: t.color.system.light.base,
    fontSize: '12px',
    transition: t.transition.fast,
    flexShrink: 0,
  }))
  .states((t) => ({
    checked: {
      backgroundColor: t.color.system.primary.base,
      borderColor: t.color.system.primary.base,
    },
  }))
  .sizes(() => ({
    small: { width: '14px', height: '14px', fontSize: '10px' },
    medium: { width: '18px', height: '18px', fontSize: '12px' },
    large: { width: '22px', height: '22px', fontSize: '14px' },
  }))
