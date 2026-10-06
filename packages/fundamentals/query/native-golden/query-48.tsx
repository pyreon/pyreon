import { signal } from '@pyreon/reactivity'
import { useQuery } from '@pyreon/query'
type Resp = { ok: boolean }
export function App(){
  const n = signal(1)
  const q = useQuery<Resp>(() => ({ queryKey: ['a'], queryFn: () => fetch('https://x', opts) }))
  return <Text>x</Text>
}
