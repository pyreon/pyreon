import { RouterLink, RouterView, useIsActive } from '@pyreon/router'
import { navGroups } from './routes'

function NavItem(props: { path: string; label: string }) {
  const isActive = useIsActive(props.path, true)

  return (
    <RouterLink
      to={props.path}
      style={() =>
        `display: block; width: 100%; text-align: left; padding: 4px 16px 4px 24px; font-size: 13px; text-decoration: none; background: ${isActive() ? '#eff6ff' : 'transparent'}; color: ${isActive() ? '#2563eb' : '#374151'}; font-weight: ${isActive() ? '500' : '400'};`
      }
    >
      {props.label}
    </RouterLink>
  )
}

export function App() {
  return (
    <div style="display: flex; min-height: 100vh;">
      {/* Sidebar */}
      <nav style="width: 240px; border-right: 1px solid #e5e7eb; padding: 16px 0; overflow-y: auto; position: fixed; top: 0; bottom: 0; background: white;">
        <div style="padding: 0 16px 16px; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px;">
          <h1 style="font-size: 18px; font-weight: 700; color: #111827;">Pyreon UI</h1>
          <span style="font-size: 12px; color: #9ca3af;">75 components</span>
        </div>

        {navGroups.map((group) => (
          <div style="margin-bottom: 8px;">
            <div style="padding: 4px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af;">
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavItem path={item.path} label={item.label} />
            ))}
          </div>
        ))}
      </nav>

      {/* Main content */}
      <main style="margin-left: 240px; flex: 1; padding: 32px 40px; max-width: 900px;">
        <RouterView />
      </main>
    </div>
  )
}
