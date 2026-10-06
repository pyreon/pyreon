
import { PyreonCrdtDoc } from '@pyreon/sync'
import { Text } from '@pyreon/primitives'
export function App() {
  const doc = new PyreonCrdtDoc('a')
      const m = doc.getMap('m')
      m.set('k', 1)
      m.get('k')
      m.has('k')
  return (<Text>x</Text>)
}
