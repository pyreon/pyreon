import { signal } from '@pyreon/reactivity'
import { createTableState } from '@pyreon/table'
export function App(){
  const rows = signal([{ id: 1, name: 'a' }])
  const t = createTableState({ data: function () { return rows() }, columns: [{ id: 'a' }] })
  return <Text>x</Text>
}
