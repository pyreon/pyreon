import { el } from '../../factory'

const InputGroup = el
  .config({ name: 'InputGroup' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'block', block: true })
  .theme(() => ({}))

export default InputGroup
