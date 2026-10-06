
import { PyreonCrdtDoc } from '@pyreon/sync'
import { Text } from '@pyreon/primitives'
export function App() {
  const { doc } = { doc: new PyreonCrdtDoc('a') }
      doc.transact(() => {})
  return (<Text>x</Text>)
}
