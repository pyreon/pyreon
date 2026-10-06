
import { Text, Press } from '@pyreon/primitives'
import { toast } from '@pyreon/toast'
export function P() {
  return <Press onPress={() => toast("Bye", { duration: 2000 })}><Text>X</Text></Press>
}
