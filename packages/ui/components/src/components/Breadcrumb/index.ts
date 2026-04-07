import { el, list } from '../../factory'

const Breadcrumb = list
  .config({ name: 'Breadcrumb' })
  .attrs({ contentDirection: 'inline' })
  .theme((t) => ({
    fontSize: t.fontSize.small,
  }))

export default Breadcrumb

export const BreadcrumbItem = el
  .config({ name: 'BreadcrumbItem' })
  .attrs({ tag: 'span', direction: 'inline', alignY: 'center' })
  .theme((t) => ({
    color: t.color.system.base[500],
    transition: t.transition.fast,
    textDecoration: 'none',
    hover: {
      color: t.color.system.base[700],
    },
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
      borderRadius: t.borderRadius.small,
    },
    active: {
      color: t.color.system.dark[800],
      fontWeight: t.fontWeight.medium,
    },
  }))
