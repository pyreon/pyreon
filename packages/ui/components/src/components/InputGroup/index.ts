import { el } from '../../factory'

const InputGroup = el
  .config({ name: 'InputGroup' })
  .attrs({ tag: 'div' })
  .theme(() => ({
    display: 'flex',
    alignItems: 'stretch',
  }))

export default InputGroup
