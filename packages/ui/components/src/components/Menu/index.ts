import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { menuTheme, menuItemTheme } from './theme'

const Menu = createComponent('Menu', Element, menuTheme, { tag: 'div' })
export default Menu

export const MenuItem = createComponent('MenuItem', Element, menuItemTheme, { tag: 'button' })
