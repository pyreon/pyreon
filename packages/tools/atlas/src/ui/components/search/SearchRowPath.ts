import { txt, type T } from '../../kit'

export const SearchRowPath = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: t.font.mono, fontSize: t.size.label, color: t.faint, flex: '1', minWidth: '0',
    extendCss: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
  }))
