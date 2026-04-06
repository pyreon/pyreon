import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { loaderTheme } from './theme'

const Loader = createComponent('Loader', Element, loaderTheme, { tag: 'span' })
export default Loader
