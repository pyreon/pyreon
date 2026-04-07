import { el } from '../../factory'

const Progress = el
  .config({ name: 'Progress' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    width: '100%',
    backgroundColor: t.color.system.base[200],
    borderRadius: t.borderRadius.pill,
    overflow: 'hidden',
  }))
  .states((t) => ({
    primary: {
      '& > [data-part="bar"]': { backgroundColor: t.color.system.primary.base },
    },
    success: {
      '& > [data-part="bar"]': { backgroundColor: t.color.system.success.base },
    },
    error: {
      '& > [data-part="bar"]': { backgroundColor: t.color.system.error.base },
    },
  }))
  .sizes(() => ({
    small: { height: '4px' },
    medium: { height: '8px' },
    large: { height: '12px' },
  }))

export default Progress
