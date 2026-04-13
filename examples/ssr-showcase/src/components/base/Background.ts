/**
 * Background — full-width wrapper with a tonal variant for alternating
 * sections. `secondary` flips to a subtly-darker tone to test color swaps
 * across light/dark mode.
 */

import { element } from '../core'

export default element
  .config({ name: 'base/Background' })
  .attrs({ tag: 'div', block: true, direction: 'rows' })
  .theme((t) => ({
    width: '100%',
    background: t.color.light.base,
    color: t.color.dark.base,
  }))
  .variants({
    secondary: {
      background: '#F1F3F5',
    },
    primary: {
      background: '#E7F5FF',
    },
  })
