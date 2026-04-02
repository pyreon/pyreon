import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Center = rocketstyle()({ name: 'Center', component: Element })
  .attrs({ tag: 'div', alignX: 'center', alignY: 'center', block: true })

export default Center
