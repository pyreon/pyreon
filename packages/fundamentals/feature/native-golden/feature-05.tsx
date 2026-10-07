import { defineFeature as feature } from '@pyreon/feature'
import { Text } from '@pyreon/primitives'
import { defineFeature } from './mine'

// An aliased import, a same-named import from elsewhere, and a keyword/underscore field name.
export const A = feature({ name: 'a', schema: { id: 'string' } })
export const B = defineFeature({ name: 'b', schema: { id: 'string' } })
export const C = defineFeature({ name: 'c', schema: { class: 'string', 'my-field': 'number', _x: 'boolean' } })

export function App() {
  return <Text>{String(A) + String(B) + String(C)}</Text>
}
