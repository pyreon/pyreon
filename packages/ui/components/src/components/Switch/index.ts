import { SwitchBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { switchTheme } from './theme'

const Switch = createComponent('Switch', SwitchBase, switchTheme)
export default Switch
