import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { imageTheme } from './theme'

const Image = createComponent('Image', Element, imageTheme, { tag: 'img' })
export default Image
