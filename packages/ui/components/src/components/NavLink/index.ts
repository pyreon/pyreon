import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { navLinkTheme } from './theme'

const resolved = getComponentTheme(navLinkTheme)

const NavLink = rocketstyle({ useBooleans: true })({
  name: 'NavLink',
  component: Element,
})
  .attrs({ tag: 'a' } as any)
  .theme(resolved.base)
  .states(resolved.states)

export default NavLink
