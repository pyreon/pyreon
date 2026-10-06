import { useFetch } from '@pyreon/query'
import { Text } from '@pyreon/primitives'
export function App(){
  const h = 'x-a'
  const q = useFetch<{ ok: boolean }>('https://x', { headers: { [h]: 'b' } })
  return <Text>x</Text>
}
