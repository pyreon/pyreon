import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Skeleton = rocketstyle({ useBooleans: true })({ name: 'Skeleton', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  })
  .variants({
    text: { width: '100%', height: 16, borderRadius: 4 },
    circle: { borderRadius: 9999 },
    rect: { borderRadius: 4 },
  })

export default Skeleton
