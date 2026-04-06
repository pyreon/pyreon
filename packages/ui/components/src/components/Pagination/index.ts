import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { paginationTheme } from './theme'

const Pagination = createComponent('Pagination', Element, paginationTheme, { tag: 'nav' })
export default Pagination
