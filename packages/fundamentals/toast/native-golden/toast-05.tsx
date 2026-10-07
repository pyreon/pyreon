import { Text, Press, Stack } from '@pyreon/primitives'
import { toast } from '@pyreon/toast'
export function App(){ return <Press onPress={() => { toast.dismiss("q") }}><Text>x</Text></Press> }
