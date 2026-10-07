
import { Text, Press } from '@pyreon/primitives'
import { announce } from '@pyreon/a11y'
export function P({ label }: { label: string }) {
  return (
    <Press data-testid="save" onPress={() => { announce(label); announce("Failed", { politeness: 'assertive' }) }}>
      <Text>Go</Text>
    </Press>
  )
}
