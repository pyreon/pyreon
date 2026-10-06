
import { Text, Press } from '@pyreon/primitives'
import { toast as notify } from '@pyreon/toast'
export function P() {
  return <Press onPress={() => notify.warning("Careful")}><Text>W</Text></Press>
}
