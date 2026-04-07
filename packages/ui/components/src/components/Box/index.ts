import { el } from '../../factory'

const Box = el
  .config({ name: 'Box' })
  .attrs({ tag: 'div' })
  .theme(() => ({}))

export default Box
