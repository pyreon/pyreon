import { el } from '../../factory'
import { RadioBase, RadioGroupBase } from '@pyreon/ui-primitives'

const Radio = el.config({ name: 'Radio', component: RadioBase })
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

export const RadioGroup = el.config({ name: 'RadioGroup', component: RadioGroupBase })
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

export const RadioIndicator = el
  .config({ name: 'RadioIndicator' })
  .attrs({ tag: 'span' })
  .theme((t) => ({
    width: '18px',
    height: '18px',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: t.color.system.base[300],
    borderRadius: t.borderRadius.pill,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.color.system.light.base,
    transition: t.transition.fast,
    flexShrink: 0,
  }))
  .states((t) => ({
    checked: {
      borderColor: t.color.system.primary.base,
    },
  }))
  .sizes(() => ({
    small: { width: '14px', height: '14px' },
    medium: { width: '18px', height: '18px' },
    large: { width: '22px', height: '22px' },
  }))

export const RadioDot = el
  .config({ name: 'RadioDot' })
  .attrs({ tag: 'span' })
  .theme((t) => ({
    width: '8px',
    height: '8px',
    borderRadius: t.borderRadius.pill,
    backgroundColor: 'transparent',
    transition: t.transition.fast,
  }))
  .states((t) => ({
    checked: {
      backgroundColor: t.color.system.primary.base,
    },
  }))
  .sizes(() => ({
    small: { width: '6px', height: '6px' },
    medium: { width: '8px', height: '8px' },
    large: { width: '10px', height: '10px' },
  }))
