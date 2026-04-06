import { ComboboxBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { autocompleteTheme } from './theme'

const Autocomplete = createComponent('Autocomplete', ComboboxBase, autocompleteTheme)
export default Autocomplete
