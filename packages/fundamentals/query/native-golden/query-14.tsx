import { signal } from '@pyreon/reactivity'
import { useQuery } from '@pyreon/query'
type Resp = { ok: boolean }
export function App(){
  const n = signal(1)
  const api = { query: () => 1 }
  const q = useQuery<Resp>(() => api.query())
  return <Text>x</Text>
}
