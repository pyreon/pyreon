import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { colorSwatchTheme } from './theme'

const ColorSwatch = createComponent('ColorSwatch', Element, colorSwatchTheme, { tag: 'div' })
export default ColorSwatch
