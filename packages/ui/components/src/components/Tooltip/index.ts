import { el } from '../../factory'

const Tooltip = el
  .config({ name: 'Tooltip' })
  // WAI-ARIA: a tooltip bubble carries `role="tooltip"` so assistive tech announces
  // it as a tooltip (Radix Tooltip content convention). The TRIGGER still owns the
  // linkage — reference this bubble's `id` from the trigger's `aria-describedby`.
  .attrs({ tag: 'div', role: 'tooltip' })
  .theme((t) => ({
    backgroundColor: t.color.system.dark[800],
    color: t.color.system.light.base,
    fontSize: t.fontSize.xSmall,
    borderRadius: t.borderRadius.small,
    paddingTop: t.spacing.xxxSmall,
    paddingBottom: t.spacing.xxxSmall,
    paddingLeft: t.spacing.xxSmall,
    paddingRight: t.spacing.xxSmall,
    zIndex: 50,
    fontWeight: t.fontWeight.medium,
    lineHeight: t.lineHeight.base,
    pointerEvents: 'none',
    maxWidth: '200px',
  }))

export default Tooltip
