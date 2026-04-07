import { el } from '../../factory'

const Progress = el
  .config({ name: 'Progress' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    width: '100%',
    backgroundColor: t.color.system.base[200],
    borderRadius: t.borderRadius.pill,
    overflow: 'hidden',
    height: '8px',
    color: t.color.system.primary.base,
  }))
  .states((t) => ({
    primary: { color: t.color.system.primary.base },
    success: { color: t.color.system.success.base },
    error: { color: t.color.system.error.base },
  }))
  .sizes(() => ({
    small: { height: '4px' },
    medium: { height: '8px' },
    large: { height: '12px' },
  }))

export default Progress
