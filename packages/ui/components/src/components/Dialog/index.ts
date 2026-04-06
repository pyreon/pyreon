import { ModalBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { dialogTheme } from './theme'

const Dialog = createComponent('Dialog', ModalBase, dialogTheme)
export default Dialog
