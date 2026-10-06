import { Stack, Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
type Res = { id: number }
export function App() {
  const qh = useQuery<Res>(() => ({ queryKey: ['h'], queryFn: () => fetch('https://x/h', { headers: { A: 'b' } }).then((r) => r.json()) }))
  return (<Stack><Text>{String(qh.data())}</Text></Stack>)
}
