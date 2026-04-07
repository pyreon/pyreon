import { el } from '../../factory'

// SimpleGrid uses CSS grid which Element doesn't handle natively.
// For advanced grid layouts, use @pyreon/coolgrid (Container, Row, Col) directly.
const SimpleGrid = el
  .config({ name: 'SimpleGrid' })
  .attrs({ tag: 'div', gap: 8 })
  .theme(() => ({
    display: 'grid',
  }))
  .sizes(() => ({
    1: { gridTemplateColumns: 'repeat(1, 1fr)' },
    2: { gridTemplateColumns: 'repeat(2, 1fr)' },
    3: { gridTemplateColumns: 'repeat(3, 1fr)' },
    4: { gridTemplateColumns: 'repeat(4, 1fr)' },
  }))

export default SimpleGrid
