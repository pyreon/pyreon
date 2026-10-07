import { signal } from '@pyreon/reactivity'
import { createTableState } from '@pyreon/table'
export function App(){
  const rows = signal([{ id: 1, name: 'a' }])
  const t = createTableState({ data: () => rows(), pageSize: p, columns: [{ id: x }] })
  return <Text>x</Text>
}
