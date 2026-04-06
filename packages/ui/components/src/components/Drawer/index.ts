import { ModalBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { drawerTheme } from './theme'

const Drawer = createComponent('Drawer', ModalBase, drawerTheme)
export default Drawer
