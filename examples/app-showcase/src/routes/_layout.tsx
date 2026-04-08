import type { Props } from '@pyreon/core'
import { RouterLink, RouterView, useIsActive } from '@pyreon/router'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { groupLabels, sections, type Section } from '../sections'
import {
  Brand,
  BrandSubtitle,
  BrandTitle,
  GlobalReset,
  Main,
  NavGroup,
  NavGroupLabel,
  NavLink,
  Shell,
  Sidebar,
  SoonBadge,
} from '../styles'

function NavItem(props: { section: Section }) {
  const isActive = useIsActive(props.section.path, false)
  const disabled = !props.section.available
  // RouterLink renders an anchor; pass `as` to forward our styled <a> styles.
  return (
    <NavLink
      as={RouterLink as unknown as 'a'}
      to={disabled ? '/' : props.section.path}
      $active={isActive() && props.section.available}
      $disabled={disabled}
    >
      <span>{props.section.label}</span>
      {disabled ? <SoonBadge>soon</SoonBadge> : null}
    </NavLink>
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
      <GlobalReset />
      <Shell>
        <Sidebar>
          <Brand as={RouterLink as unknown as 'a'} to="/">
            <BrandTitle>Pyreon Apps</BrandTitle>
            <BrandSubtitle>One Zero app, many features</BrandSubtitle>
          </Brand>
          {groups.map((g) => (
            <NavGroup>
              <NavGroupLabel>{g.label}</NavGroupLabel>
              {g.items.map((item) => (
                <NavItem section={item} />
              ))}
            </NavGroup>
          ))}
        </Sidebar>
        <Main>
          <RouterView />
        </Main>
      </Shell>
    </PyreonUI>
  )
}
