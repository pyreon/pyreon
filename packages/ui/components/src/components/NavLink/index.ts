import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { navLinkTheme } from './theme'

const NavLink = createComponent('NavLink', Element, navLinkTheme, { tag: 'a' })
export default NavLink
