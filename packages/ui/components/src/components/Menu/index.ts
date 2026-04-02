import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { menuTheme, menuItemTheme } from './theme'

const mResolved = getComponentTheme(menuTheme)

const Menu = rocketstyle({ useBooleans: true })({
  name: 'Menu',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme(mResolved.base)

export default Menu

const miResolved = getComponentTheme(menuItemTheme)

export const MenuItem = rocketstyle({ useBooleans: true })({
  name: 'MenuItem',
  component: Element,
})
  .attrs({ tag: 'button' } as any)
  .theme(miResolved.base)
