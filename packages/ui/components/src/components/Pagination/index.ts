import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { paginationTheme } from './theme'

const resolved = getComponentTheme(paginationTheme)

const Pagination = rocketstyle({ useBooleans: true })({
  name: 'Pagination',
  component: Element,
})
  .attrs({ tag: 'nav' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Pagination
