import { el } from '../../factory'

const Center = el
  .config({ name: 'Center' })
  .attrs({ tag: 'div', alignX: 'center', alignY: 'center', block: true })
  .theme(() => ({}))

export default Center
