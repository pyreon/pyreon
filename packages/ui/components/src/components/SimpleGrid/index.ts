import { el } from '../../factory'

const SimpleGrid = el
  .config({ name: 'SimpleGrid' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    display: 'grid',
    gap: t.spacing.small,
  }))
  .sizes(() => ({
    1: { gridTemplateColumns: 'repeat(1, 1fr)' },
    2: { gridTemplateColumns: 'repeat(2, 1fr)' },
    3: { gridTemplateColumns: 'repeat(3, 1fr)' },
    4: { gridTemplateColumns: 'repeat(4, 1fr)' },
  }))

export default SimpleGrid
