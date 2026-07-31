import { el, type InputEl } from '../../kit'

export const Range = el
  .attrs({
    tag: 'input',
  })
  .theme(() => ({
    flex: '1',
  })) as unknown as InputEl
