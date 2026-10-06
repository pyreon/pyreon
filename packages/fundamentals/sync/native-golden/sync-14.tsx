
import { PyreonCrdtDoc } from '@pyreon/sync'
import { Text } from '@pyreon/primitives'
export function App() {
  const doc = new PyreonCrdtDoc('a')
      doc.somebodyElsesMethod()
  return (<Text>x</Text>)
}
