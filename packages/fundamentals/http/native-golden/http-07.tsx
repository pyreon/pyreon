import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
interface Item { id: string }
export function P() {
  const p = useFetch<Item>('https://x.dev/a', { method: 'post', headers: { 'X-A': '1' }, body: '{}' })
  return (<Stack><Text>{p.data()?.id ?? 'none'}</Text></Stack>)
}
