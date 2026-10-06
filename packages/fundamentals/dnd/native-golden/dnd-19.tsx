import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/table'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const rows = signal<string[]>(['a'])
  const sort = useSortable({ items: () => rows(), by: (r: string) => r, onReorder: (n: string[]) => rows.set(n) })
  return (<Stack><Text>{String(rows().length)}</Text></Stack>)
}
