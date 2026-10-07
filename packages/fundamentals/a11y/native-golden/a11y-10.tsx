
import { Text, Press } from '@pyreon/primitives'
import { announce as say } from '@pyreon/a11y'
export function P() {
  return <Press onPress={() => say("Hi")}><Text>Go</Text></Press>
}
