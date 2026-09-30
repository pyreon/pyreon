import { state } from '@pyreon/core/plain'
import { NavLink, Title } from '@pyreon/ui-components'

export function NavLinkDemo() {
  let active = state('Dashboard')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">NavLink</Title>

      <Title size="h3" style="margin-bottom: 12px">Sidebar Navigation</Title>
      <div style="width: 220px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px;">
        <NavLink state={active === 'Dashboard' ? 'active' : undefined} onClick={() => { active = 'Dashboard' }}>Dashboard</NavLink>
        <NavLink state={active === 'Settings' ? 'active' : undefined} onClick={() => { active = 'Settings' }}>Settings</NavLink>
        <NavLink state={active === 'Users' ? 'active' : undefined} onClick={() => { active = 'Users' }}>Users</NavLink>
        <NavLink state={active === 'Reports' ? 'active' : undefined} onClick={() => { active = 'Reports' }}>Reports</NavLink>
        <NavLink state={active === 'Billing' ? 'active' : undefined} onClick={() => { active = 'Billing' }}>Billing</NavLink>
      </div>

      <div style="font-size: 14px; color: #6b7280;">
        Active: {active}
      </div>
    </div>
  )
}
