import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { breadcrumbTheme, breadcrumbItemTheme } from './theme'

const Breadcrumb = createComponent('Breadcrumb', Element, breadcrumbTheme, { tag: 'nav' })
export default Breadcrumb

export const BreadcrumbItem = createComponent('BreadcrumbItem', Element, breadcrumbItemTheme, { tag: 'a' })
