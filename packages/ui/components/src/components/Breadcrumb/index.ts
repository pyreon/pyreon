import { Element } from '@pyreon/elements'
import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Breadcrumb = rocketstyle({ useBooleans: true })({
  name: 'Breadcrumb',
  component: Element,
})
  .attrs({ tag: 'nav' } as any)
  .theme({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    color: '#6b7280',
  })

export const BreadcrumbItem = rocketstyle({ useBooleans: true })({
  name: 'BreadcrumbItem',
  component: Text,
})
  .attrs({ tag: 'a' } as any)
  .theme({
    color: '#6b7280',
    textDecoration: 'none',
    ':hover': {
      color: '#374151',
    },
  })

export default Breadcrumb
