import { Stack, Text, Button } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
import { toast } from '@pyreon/toast'
export function App() {
  const n = signal(1)
  const xs = signal<number[]>([1])
  const s2 = signal('a')
  const m = new Map<string, number>()
  const st = new Set<number>()
  const a = computed(() => m.clear())
  return (<Stack><Text>x</Text></Stack>)
}
