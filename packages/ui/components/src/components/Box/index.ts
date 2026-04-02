import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Box = rocketstyle()({ name: 'Box', component: Element })
  .attrs({ tag: 'div' })

export default Box
