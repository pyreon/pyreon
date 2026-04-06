import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { progressTheme } from './theme'

const Progress = createComponent('Progress', Element, progressTheme, { tag: 'div' })
export default Progress
