import { txt } from '../../factory'

const Highlight = txt
  .config({ name: 'Highlight' })
  .attrs({ tag: 'span' })
  .theme((t: any) => ({
    backgroundColor: t.color.system.warning[200],
    color: 'inherit',
    borderRadius: t.borderRadius.small,
    padding: `0 ${t.spacing.xxxSmall}`,
  }))
  .states((t: any) => ({
    primary: { backgroundColor: t.color.system.primary[100] },
    success: { backgroundColor: t.color.system.success[100] },
    warning: { backgroundColor: t.color.system.warning[200] },
    error: { backgroundColor: t.color.system.error[100] },
  }))

export default Highlight
