import { signal } from '@pyreon/reactivity'
import { createTableState } from '@pyreon/table'
export function App(){
  const rows = signal([{ id: 1, name: 'a' }])
  const t = createTableState({ 'data': () => rows(), pageSize: 10, ...rest, columns: [{ id: 'name', 'header': 'N', [k]: 1, ...c }, 5, { id: 1 }] })
  return <Text>x</Text>
}
