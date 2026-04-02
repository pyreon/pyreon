import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const SimpleGrid = rocketstyle({ useBooleans: true })({ name: 'SimpleGrid', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  })
  .sizes({
    1: { gridTemplateColumns: 'repeat(1, 1fr)' },
    2: { gridTemplateColumns: 'repeat(2, 1fr)' },
    3: { gridTemplateColumns: 'repeat(3, 1fr)' },
    4: { gridTemplateColumns: 'repeat(4, 1fr)' },
  })

export default SimpleGrid
