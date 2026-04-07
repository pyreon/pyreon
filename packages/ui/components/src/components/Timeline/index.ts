import { el } from '../../factory'

const Timeline = el
  .config({ name: 'Timeline' })
  .attrs({ tag: 'div', direction: 'rows' })
  .theme((t) => ({
    paddingLeft: t.spacing.medium,
    borderWidthLeft: '2px',
    borderStyleLeft: 'solid',
    borderColorLeft: t.color.system.base[200],
  }))

export default Timeline
