import { txt, type T } from '../../kit'

export const CtrlLabel = txt
  .attrs({
    tag: 'label',
  })
  .theme((t: T) => ({
    fontSize: t.size.body,
    fontWeight: '600',
  }))
