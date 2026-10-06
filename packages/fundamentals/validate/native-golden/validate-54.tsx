import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string() })
export function App() {
  const ok = computed(() => Pet.safeParse({ name: 'x' }).success)
  return <Text>{ok() ? 'y' : 'n'}</Text>
}
