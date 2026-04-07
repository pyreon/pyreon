import rocketstyle from '@pyreon/rocketstyle'
import { SwitchBase } from '@pyreon/ui-primitives'

const rs = rocketstyle({ useBooleans: true })

const Switch = rs({ name: 'Switch', component: SwitchBase })
  .theme((t: any) => ({
    backgroundColor: t.color.system.base[300],
    borderRadius: t.borderRadius.pill,
    cursor: 'pointer',
    transition: t.transition.fast,
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    hover: { backgroundColor: t.color.system.base[400] },
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
    },
    active: { backgroundColor: t.color.system.primary.base },
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
