import { el } from '../../factory'

const InputGroup = el
  .config({ name: 'InputGroup' })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', block: true })
  .theme(() => ({}))

export default InputGroup
