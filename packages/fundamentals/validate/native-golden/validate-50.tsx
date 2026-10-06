import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
export function App() {
  const ok = computed(() => s.object({}).safeParse({ n: 1 }).success)
  return <Text>{String(ok())}</Text>
}
