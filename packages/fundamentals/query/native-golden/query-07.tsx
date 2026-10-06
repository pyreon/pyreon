import { Text, Press, Stack } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
export function App(){ const id = signal(1); const st = 5; const q = useQuery<string>(() => ({ queryKey: ['u', id()], queryFn: () => fetch(`https://x.dev/u/${id()}`), staleTime: st })); return <Text>x</Text> }
