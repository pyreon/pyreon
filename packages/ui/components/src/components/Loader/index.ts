import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Loader = rocketstyle({ useBooleans: true })({ name: 'Loader', component: Element })
  .attrs({ tag: 'span' } as any)
  .theme({
    display: 'inline-flex',
    color: '#3b82f6',
  })
  .states({
    primary: { color: '#3b82f6' },
    secondary: { color: '#6b7280' },
    success: { color: '#22c55e' },
    error: { color: '#ef4444' },
  })
  .sizes({
    sm: { width: 16, height: 16 },
    md: { width: 24, height: 24 },
    lg: { width: 32, height: 32 },
    xl: { width: 48, height: 48 },
  })
  .variants({
    spinner: {},
    dots: {},
    bars: {},
  })

export default Loader
