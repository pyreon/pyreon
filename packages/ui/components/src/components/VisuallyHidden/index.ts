import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { visuallyHiddenTheme } from './theme'

const VisuallyHidden = createComponent('VisuallyHidden', Element, visuallyHiddenTheme, { tag: 'span' })
export default VisuallyHidden
