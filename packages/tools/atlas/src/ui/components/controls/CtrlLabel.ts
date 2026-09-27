import { txt } from '../../kit'

export const CtrlLabel = txt
  .attrs({
    tag: 'label',
  })
  .theme((t) => ({
    fontSize: t.size.body,
    fontWeight: '600',
  }))
