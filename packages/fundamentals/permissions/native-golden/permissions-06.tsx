import { usePermissions as usePerms } from '@pyreon/permissions'
import { usePermissions } from './mine'
import { Text } from '@pyreon/primitives'

export function Aliased() {
  const a = usePerms(['aliased'])
  const b = usePermissions(['user-defined'])
  return <Text>{a('aliased') ? 'a' : 'b'}{b('user-defined') ? 'c' : 'd'}</Text>
}
