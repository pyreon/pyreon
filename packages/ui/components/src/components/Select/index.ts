import { SelectBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { selectTheme } from './theme'

const Select = createComponent('Select', SelectBase, selectTheme)
export default Select
