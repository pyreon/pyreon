import { el } from '../../factory'

const Indicator = el
  .config({ name: 'Indicator' })
  .attrs({ tag: 'span' })
  .theme((t: any) => ({
    display: 'inline-block',
    borderRadius: t.borderRadius.pill,
    flexShrink: 0,
  }))
  .states((t: any) => ({
    primary: { backgroundColor: t.color.system.primary.base },
    success: { backgroundColor: t.color.system.success.base },
    error: { backgroundColor: t.color.system.error.base },
    warning: { backgroundColor: t.color.system.warning.base },
  }))
  .sizes(() => ({
    small: { width: '8px', height: '8px' },
    medium: { width: '10px', height: '10px' },
    large: { width: '12px', height: '12px' },
  }))

export default Indicator
