import { txt } from '../../kit'

export const CompName = txt
  .attrs({
    tag: 'span',
  })
  .theme(() => ({
    flex: '1',
    minWidth: '0',
    extendCss: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
  }))
