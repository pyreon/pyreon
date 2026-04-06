import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { aspectRatioTheme } from './theme'

const AspectRatio = createComponent('AspectRatio', Element, aspectRatioTheme, { tag: 'div' })
export default AspectRatio
