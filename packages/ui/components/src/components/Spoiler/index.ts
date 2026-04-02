import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Spoiler = rocketstyle({ useBooleans: true })({ name: 'Spoiler', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    position: 'relative',
    overflow: 'hidden',
  })

export default Spoiler
