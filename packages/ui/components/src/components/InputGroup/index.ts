import { el } from '../../factory'

const InputGroup = el
  .config({ name: 'InputGroup' })
  .attrs({ tag: 'div', direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center', alignY: 'center', block: true })

export default InputGroup
