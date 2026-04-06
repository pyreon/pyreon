import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { skeletonTheme } from './theme'

const Skeleton = createComponent('Skeleton', Element, skeletonTheme, { tag: 'div' })
export default Skeleton
