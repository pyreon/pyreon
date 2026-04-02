import { Element, Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { breadcrumbTheme, breadcrumbItemTheme } from './theme'

const bResolved = getComponentTheme(breadcrumbTheme)

const Breadcrumb = rocketstyle({ useBooleans: true })({
  name: 'Breadcrumb',
  component: Element,
})
  .attrs({ tag: 'nav' } as any)
  .theme(bResolved.base)

export default Breadcrumb

const biResolved = getComponentTheme(breadcrumbItemTheme)

export const BreadcrumbItem = rocketstyle({ useBooleans: true })({
  name: 'BreadcrumbItem',
  component: Text,
})
  .attrs({ tag: 'a' } as any)
  .theme(biResolved.base)
