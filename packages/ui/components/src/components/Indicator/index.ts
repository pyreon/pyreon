import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Indicator = rocketstyle({ useBooleans: true })({ name: 'Indicator', component: Element })
  .attrs({ tag: 'span' } as any)
  .theme({
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#ffffff',
    display: 'inline-block',
  })
  .states({
    primary: { backgroundColor: '#3b82f6' },
    success: { backgroundColor: '#22c55e' },
    error: { backgroundColor: '#ef4444' },
    warning: { backgroundColor: '#f59e0b' },
  })
  .sizes({
    sm: { width: 8, height: 8 },
    md: { width: 10, height: 10 },
    lg: { width: 12, height: 12 },
  })

export default Indicator
