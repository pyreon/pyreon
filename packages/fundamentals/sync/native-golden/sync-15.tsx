
import { PyreonCrdtDoc } from '@pyreon/sync'
import { Text } from '@pyreon/primitives'
export function App() {
  const doc = new PyreonCrdtDoc('a')
      const k = 'transact'
      doc[k](() => {})
  return (<Text>x</Text>)
}
