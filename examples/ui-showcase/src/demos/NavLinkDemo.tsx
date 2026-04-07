import { signal } from '@pyreon/reactivity'
import { NavLink } from '@pyreon/ui-components'

export function NavLinkDemo() {
  const active = signal('Dashboard')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">NavLink</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sidebar Navigation</h3>
      <div style="width: 220px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px;">
        <NavLink state={() => active() === 'Dashboard' ? 'active' : undefined} onClick={() => active.set('Dashboard')}>Dashboard</NavLink>
        <NavLink state={() => active() === 'Settings' ? 'active' : undefined} onClick={() => active.set('Settings')}>Settings</NavLink>
        <NavLink state={() => active() === 'Users' ? 'active' : undefined} onClick={() => active.set('Users')}>Users</NavLink>
        <NavLink state={() => active() === 'Reports' ? 'active' : undefined} onClick={() => active.set('Reports')}>Reports</NavLink>
        <NavLink state={() => active() === 'Billing' ? 'active' : undefined} onClick={() => active.set('Billing')}>Billing</NavLink>
      </div>

      <div style="font-size: 14px; color: #6b7280;">
        Active: {() => active()}
      </div>
    </div>
  )
}
