import type { Props } from '@pyreon/core'
import { RouterLink, RouterView, useIsActive } from '@pyreon/router'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { groupLabels, sections, type Section } from '../sections'

function NavItem(props: { section: Section }) {
  const isActive = useIsActive(props.section.path, false)

  return (
    <RouterLink
      to={props.section.available ? props.section.path : '/'}
      style={() => {
        const active = isActive() && props.section.available
        const disabled = !props.section.available
        const bg = active ? '#eef2ff' : 'transparent'
        const color = disabled ? '#9ca3af' : active ? '#4338ca' : '#374151'
        const weight = active ? 600 : 400
        const cursor = disabled ? 'not-allowed' : 'pointer'
        return `display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 16px 6px 24px; font-size: 13px; text-decoration: none; background: ${bg}; color: ${color}; font-weight: ${weight}; cursor: ${cursor};`
      }}
    >
      <span>{props.section.label}</span>
      {props.section.available ? null : (
        <span style="font-size: 9px; padding: 2px 6px; background: #f3f4f6; border-radius: 999px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">
          soon
        </span>
      )}
    </RouterLink>
  )
}

const groups = (['apps', 'forms', 'data', 'visual'] as const).map((group) => ({
  group,
  label: groupLabels[group],
  items: sections.filter((s) => s.group === group),
}))

export function layout(_props: Props) {
  return (
    <PyreonUI theme={theme} mode="system">
      <div style="display: flex; min-height: 100vh;">
        <nav style="width: 240px; border-right: 1px solid #e5e7eb; padding: 16px 0; overflow-y: auto; position: fixed; top: 0; bottom: 0; background: white;">
          <RouterLink
            to="/"
            style="display: block; padding: 0 16px 16px; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px; text-decoration: none; color: inherit;"
          >
            <h1 style="font-size: 18px; font-weight: 700; color: #111827;">Pyreon Apps</h1>
            <span style="font-size: 12px; color: #9ca3af;">One Zero app, many features</span>
          </RouterLink>

          {groups.map((g) => (
            <div style="margin-bottom: 12px;">
              <div style="padding: 4px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af;">
                {g.label}
              </div>
              {g.items.map((item) => (
                <NavItem section={item} />
              ))}
            </div>
          ))}
        </nav>

        <main style="margin-left: 240px; flex: 1; min-height: 100vh;">
          <RouterView />
        </main>
      </div>
    </PyreonUI>
  )
}
