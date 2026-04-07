import { el } from '../../factory'
import { SwitchBase } from '@pyreon/ui-primitives'

const Switch = el.config({ name: 'Switch', component: SwitchBase })
  .theme((t) => ({
    backgroundColor: t.color.system.base[300],
    borderRadius: t.borderRadius.pill,
    cursor: 'pointer',
    transition: t.transition.fast,
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px',
    hover: {
      backgroundColor: t.color.system.base[400],
    },
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
    },
    active: {
      backgroundColor: t.color.system.primary.base,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  }))
  .sizes(() => ({
    small: { width: '28px', height: '16px' },
    medium: { width: '36px', height: '20px' },
    large: { width: '44px', height: '24px' },
  }))

export default Switch

export const SwitchThumb = el
  .config({ name: 'SwitchThumb' })
  .attrs({ tag: 'span' })
  .theme((t) => ({
    width: '16px',
    height: '16px',
    borderRadius: t.borderRadius.pill,
    backgroundColor: t.color.system.light.base,
    boxShadow: t.shadows.small,
    transition: t.transition.fast,
    transform: 'translateX(0)',
  }))
  .states(() => ({
    checked: {
      transform: 'translateX(20px)',
    },
  }))
  .sizes(() => ({
    small: {
      width: '12px',
      height: '12px',
    },
    medium: {
      width: '16px',
      height: '16px',
    },
    large: {
      width: '20px',
      height: '20px',
    },
  }))
