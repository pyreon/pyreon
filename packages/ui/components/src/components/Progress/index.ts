import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Progress = rocketstyle({ useBooleans: true })({ name: 'Progress', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    width: '100%',
    backgroundColor: '#e5e7eb',
    borderRadius: 9999,
    overflow: 'hidden',
  })
  .states({
    primary: { backgroundColor: '#e5e7eb' },
    success: { backgroundColor: '#dcfce7' },
    error: { backgroundColor: '#fee2e2' },
  })
  .sizes({
    sm: { height: 4 },
    md: { height: 8 },
    lg: { height: 12 },
  })

export default Progress
