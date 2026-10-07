import { createPermissions, usePermissions, PermissionsProvider, type PermissionsOptions } from '@pyreon/permissions'
import { Text } from '@pyreon/primitives'

const can = usePermissions(['top.level'])
const perms = createPermissions({ a: true })

export function Imported() {
  const { can: check } = usePermissions()
  const { cannot, not } = usePermissions(['x'])
  return <Text>{check('a') ? 'yes' : 'no'}{cannot('b') ? 'x' : 'y'}{not('c') ? 'p' : 'q'}</Text>
}
