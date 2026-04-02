import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Timeline = rocketstyle({ useBooleans: true })({ name: 'Timeline', component: Element })
  .attrs({ tag: 'div', direction: 'rows' } as any)
  .theme({
    position: 'relative',
    paddingLeft: 24,
    listStyle: 'none',
    margin: 0,
  })

export default Timeline
