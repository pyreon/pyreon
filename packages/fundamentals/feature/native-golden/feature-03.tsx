import { defineFeature } from '@pyreon/feature'
import { Text } from '@pyreon/primitives'

const key = 'x'
const schemaOf = { id: 'string' }

// Every shape the recognizer refuses: each says why, and falls back to the Tier-2 diagnostic.
export const NoName = defineFeature({ schema: { id: 'string' } })
export const DynamicName = defineFeature({ name: key, schema: { id: 'string' } })
export const NonLiteralSchema = defineFeature({ name: 'a', schema: schemaOf })
export const NoFields = defineFeature({ name: 'b', schema: {} })
export const BadField = defineFeature({ name: 'c', schema: { id: 'string', n: 5, d: 'date', ok: 'boolean' } })
export const ComputedKey = defineFeature({ name: 'd', [key]: 1, schema: { [key]: 'string', id: 'string' } })
export const NotObject = defineFeature(schemaOf)
export const NoArgs = defineFeature()
const One = defineFeature({ name: 'e', schema: { id: 'string' } }), Two = 2

export function App() {
  return <Text>{String(Two)}</Text>
}
