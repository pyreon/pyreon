import { signal } from '@pyreon/reactivity'
import { type Role, setRole } from './permissions'
import { RoleButton, RoleToggle } from './styled'

/**
 * Top-right Admin / Viewer toggle. Drives the section's permissions
 * singleton via `setRole`. The local signal mirrors the active role so
 * the buttons can highlight the current selection without subscribing
 * to the permissions store.
 */
const activeRole = signal<Role>('admin')

export function RoleToggleHeader() {
  return (
    <RoleToggle>
      <RoleButton
        type="button"
        $active={activeRole() === 'admin'}
        onClick={() => {
          activeRole.set('admin')
          setRole('admin')
        }}
      >
        Admin
      </RoleButton>
      <RoleButton
        type="button"
        $active={activeRole() === 'viewer'}
        onClick={() => {
          activeRole.set('viewer')
          setRole('viewer')
        }}
      >
        Viewer
      </RoleButton>
    </RoleToggle>
  )
}
