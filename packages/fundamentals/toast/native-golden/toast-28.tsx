import { toast, Toaster } from '@pyreon/toast'
import { signal } from '@pyreon/reactivity'
import { Button, Stack } from '@pyreon/primitives'
export function App(){
  const rows = signal([{ id: 1, label: 'a' }])
  return <Stack><Toaster /><Button onPress={() => toast.success(rows()[0].label)}>go</Button></Stack>
}
