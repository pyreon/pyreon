import { Text, Press, Stack } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
export function App(){ const q = useQuery<string>(() => ({ queryKey: ['a'] })); return <Text>x</Text> }
