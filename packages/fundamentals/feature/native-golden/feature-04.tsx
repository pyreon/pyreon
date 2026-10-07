import { defineFeature } from '@pyreon/feature'
import { Stack, Text } from '@pyreon/primitives'

// In a component body, and destructured: the Tier-2 diagnostic, naming the binding.
export function App() {
  const local = defineFeature({ name: 'local', schema: { id: 'string' } })
  const { a } = defineFeature({ name: 'x', schema: { id: 'string' } })
  return <Stack><Text>{String(local)}</Text><Text>{String(a)}</Text></Stack>
}
