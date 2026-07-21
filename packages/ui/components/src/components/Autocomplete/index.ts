import { ComboboxStyled } from '../Combobox'

/**
 * Autocomplete is a Combobox with a different display name. It re-configures
 * the STYLED render-prop chain (`ComboboxStyled`, `component: ComboboxBase`)
 * — the batteries-included `Combobox` default export is a ComponentFn and has
 * no `.config()`.
 */
const Autocomplete = ComboboxStyled.config({ name: 'Autocomplete' })

export default Autocomplete
