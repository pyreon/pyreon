import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { pinInputTheme, pinInputCellTheme } from './theme'

const PinInput = createComponent('PinInput', Element, pinInputTheme, { tag: 'div' })
export default PinInput

export const PinInputCell = createComponent('PinInputCell', Element, pinInputCellTheme, { tag: 'input' })
