import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Stepper = rocketstyle({ useBooleans: true })({ name: 'Stepper', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  })
  .variants({
    horizontal: { flexDirection: 'row' },
    vertical: { flexDirection: 'column' },
  })

export default Stepper

export const Step = rocketstyle({ useBooleans: true })({ name: 'Step', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    borderRadius: 9999,
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 500,
    backgroundColor: '#e5e7eb',
    color: '#4b5563',
    flexShrink: 0,
  })
  .states({
    default: { backgroundColor: '#e5e7eb', color: '#4b5563' },
    active: { backgroundColor: '#3b82f6', color: '#ffffff' },
    completed: { backgroundColor: '#22c55e', color: '#ffffff' },
  })
