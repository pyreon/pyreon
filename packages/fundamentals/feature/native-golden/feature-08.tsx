import { defineFeature } from '@pyreon/feature'
import { Text } from '@pyreon/primitives'

// Type-only layers (`as const`, `satisfies`, parentheses) around the config values change nothing.
export const A = defineFeature({ name: 'a' as const, schema: { id: 'string' as const, n: ('number') as const } as const })
export const B = defineFeature({ name: ('b'), schema: ({ ok: 'boolean' }) satisfies Record<string, string> })

export function App() {
  return <Text>{A.name + B.name}</Text>
}
