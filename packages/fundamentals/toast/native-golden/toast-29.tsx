import { toast } from '@pyreon/toast'
import { Button } from '@pyreon/primitives'
export function App(){
  return <Button onPress={() => { toast[kind]('q'); toast.success('ok') }}>go</Button>
}
