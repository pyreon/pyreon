import { el } from '../../factory'

const Timeline = el
  .config({ name: 'Timeline' })
  .attrs({ tag: 'div', direction: 'rows' })
  .theme((t) => ({
    paddingLeft: t.spacing.medium,
    borderLeftWidth: '2px',
    borderLeftStyle: 'solid',
    borderLeftColor: t.color.system.base[200],
  }))

export default Timeline
