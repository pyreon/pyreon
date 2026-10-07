import { toast } from '@pyreon/toast'
import { Press, Text } from '@pyreon/primitives'
export function App(){ return <Press onPress={() => { toast.success("ok") }}><Text>x</Text></Press> }
