import { ComboboxBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { multiSelectTheme } from './theme'

const MultiSelect = createComponent('MultiSelect', ComboboxBase, multiSelectTheme)
export default MultiSelect
