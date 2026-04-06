import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { tableTheme } from './theme'

const Table = createComponent('Table', Element, tableTheme, { tag: 'table' })
export default Table
