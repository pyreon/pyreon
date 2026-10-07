import { Text, Press, Stack } from '@pyreon/primitives'
import { toast } from '@pyreon/toast'
export function App(){ return <Press onPress={() => { toast.loading("L", { duration: 500 }) }}><Text>x</Text></Press> }
