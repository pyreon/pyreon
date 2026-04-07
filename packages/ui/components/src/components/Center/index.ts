import { el } from '../../factory'

const Center = el
  .config({ name: 'Center' })
  .attrs({ tag: 'div', alignX: 'center', alignY: 'center', block: true })
  .theme(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }))

export default Center
