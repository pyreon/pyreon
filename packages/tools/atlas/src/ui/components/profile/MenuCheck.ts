import { txt, type T } from '../../kit'

export const MenuCheck = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ color: t.accent, fontSize: t.size.caption, flex: 'none' }))
