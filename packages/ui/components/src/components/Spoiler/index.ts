import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { spoilerTheme } from './theme'

const Spoiler = createComponent('Spoiler', Element, spoilerTheme, { tag: 'div' })
export default Spoiler
