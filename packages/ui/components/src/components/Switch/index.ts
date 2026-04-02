import rocketstyle from '@pyreon/rocketstyle'
import { SwitchBase } from '@pyreon/ui-primitives'

const Switch = rocketstyle({ useBooleans: true })({ name: 'Switch', component: SwitchBase as any })
  .theme({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: 14,
    color: '#374151',
    backgroundColor: '#d1d5db',
    borderRadius: 9999,
    borderWidth: 0,
    padding: 2,
    width: 44,
    height: 24,
    transition: 'background-color 200ms ease',
    position: 'relative',
  })
  .sizes({
    sm: { width: 36, height: 20, padding: 2 },
    md: { width: 44, height: 24, padding: 2 },
    lg: { width: 52, height: 28, padding: 3 },
  })
  .states({
    primary: { backgroundColor: '#d1d5db' },
    success: { backgroundColor: '#d1d5db' },
  })

export default Switch
