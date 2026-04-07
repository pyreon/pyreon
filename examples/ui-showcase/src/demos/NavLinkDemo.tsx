import { signal } from '@pyreon/reactivity'
import { NavLink } from '@pyreon/ui-components'

export function NavLinkDemo() {
  const activeLink = signal('dashboard')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">NavLink</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Navigation links with active/inactive states, icons, and nested hierarchy.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Active / Inactive States</h3>
      <div style="display: flex; flex-direction: column; gap: 4px; width: 240px; margin-bottom: 24px;">
        <NavLink {...{ state: 'active' } as any}>Dashboard (active)</NavLink>
        <NavLink>Projects (inactive)</NavLink>
        <NavLink>Settings (inactive)</NavLink>
        <NavLink>Analytics (inactive)</NavLink>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Interactive</h3>
      <div style="display: flex; flex-direction: column; gap: 4px; width: 240px; margin-bottom: 24px;">
        {['dashboard', 'projects', 'settings', 'analytics', 'help'].map((item) => (
          <NavLink
            {...(activeLink() === item ? { state: 'active' } as any : {})}
            onClick={() => activeLink.set(item)}
            style="cursor: pointer;"
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </NavLink>
        ))}
        <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">Active: {() => activeLink()}</p>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Icons</h3>
      <div style="display: flex; flex-direction: column; gap: 4px; width: 260px; margin-bottom: 24px;">
        <NavLink {...{ state: 'active' } as any}>
          <span style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 16px; width: 20px; text-align: center;">@</span>
            Dashboard
          </span>
        </NavLink>
        <NavLink>
          <span style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 16px; width: 20px; text-align: center;">#</span>
            Projects
          </span>
        </NavLink>
        <NavLink>
          <span style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 16px; width: 20px; text-align: center;">*</span>
            Favorites
          </span>
        </NavLink>
        <NavLink>
          <span style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 16px; width: 20px; text-align: center;">%</span>
            Analytics
          </span>
        </NavLink>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Nested Links</h3>
      <div style="display: flex; flex-direction: column; gap: 4px; width: 260px; margin-bottom: 24px;">
        <NavLink {...{ state: 'active' } as any}>
          <span style="display: flex; align-items: center; gap: 10px;">
            <span style="width: 20px; text-align: center;">#</span>
            Settings
          </span>
        </NavLink>
        <div style="padding-left: 32px; display: flex; flex-direction: column; gap: 2px;">
          <NavLink>General</NavLink>
          <NavLink>Security</NavLink>
          <NavLink>Notifications</NavLink>
          <NavLink>Billing</NavLink>
        </div>
        <NavLink>
          <span style="display: flex; align-items: center; gap: 10px;">
            <span style="width: 20px; text-align: center;">@</span>
            Team
          </span>
        </NavLink>
        <div style="padding-left: 32px; display: flex; flex-direction: column; gap: 2px;">
          <NavLink>Members</NavLink>
          <NavLink>Roles</NavLink>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="display: flex; flex-direction: column; gap: 4px; width: 240px; margin-bottom: 24px;">
        <NavLink>Active Link</NavLink>
        <NavLink disabled style="opacity: 0.5; pointer-events: none;">Disabled Link</NavLink>
        <NavLink>Another Link</NavLink>
      </div>
    </div>
  )
}
