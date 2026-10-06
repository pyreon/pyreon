import { announce as say } from '@pyreon/a11y'
import { signal } from '@pyreon/reactivity'
import { Button } from '@pyreon/primitives'
export function App(){
  const rows = signal([{ id: 1, label: 'a' }])
  return <Button onPress={() => { say(); say('x', { [k]: 1, politeness: 'assertive' }); say('y', { politeness: 'polite', clear: true }); say(rows()[0].label, { politeness: 'assertive' }) }}>go</Button>
}
