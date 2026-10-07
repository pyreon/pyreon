import { PermissionsProvider } from '@pyreon/permissions'
import { Text } from '@pyreon/primitives'

// The provider is imported but never rendered: the blanket unlowered-module line is the only signal.
export function Unused() {
  return <Text>no provider here</Text>
}
