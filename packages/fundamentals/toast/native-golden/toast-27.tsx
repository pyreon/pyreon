import { toast as notify } from '@pyreon/toast'
import { Button } from '@pyreon/primitives'
export function App(){
  return <Button onPress={() => { notify.bogus('q'); notify.update('q'); notify['info']('q'); notify('a', { [k]: 1, duration: 500 }); notify.error('b', { duration: 0, icon: 'x' }); notify.loading('c'); notify.success(); notify() }}>go</Button>
}
