import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
import { useFetch } from '@pyreon/http'
type Q = { id: number; text: string }
export function App() {
  const q = useFetch<Q>('https://example.test/q.json')
  const d = computed(() => q.data()?.text)
  return (<Stack><Text>{d()}</Text></Stack>)
}
