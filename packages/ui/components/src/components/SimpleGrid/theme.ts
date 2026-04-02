import { defineComponentTheme } from '@pyreon/ui-theme'

export const simpleGridTheme = defineComponentTheme('SimpleGrid', (t) => ({
  base: {
    display: 'grid',
    gap: t.spacing[4],
  },
  sizes: {
    1: { gridTemplateColumns: 'repeat(1, 1fr)' },
    2: { gridTemplateColumns: 'repeat(2, 1fr)' },
    3: { gridTemplateColumns: 'repeat(3, 1fr)' },
    4: { gridTemplateColumns: 'repeat(4, 1fr)' },
  },
}))
