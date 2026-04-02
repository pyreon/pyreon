import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { tableTheme } from './theme'

const resolved = getComponentTheme(tableTheme)

const Table = rocketstyle({ useBooleans: true })({ name: 'Table', component: Element })
  .attrs({ tag: 'table' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)
  .variants(resolved.variants)

export default Table
