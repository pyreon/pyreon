import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const a = computed(() => s.object({ n: s.number() }).safeParse({}).success)
  const b = computed(() => s.object({ n: s.number() }).safeParse({ n: 1, o: { p: 2 }, arr: [], arr2: [1, 2] }).success)
  return (<Stack><Text>{a() && b() ? 'v' : 'i'}</Text></Stack>)
}
