import { el } from '../../factory'

const PinInput = el
  .config({ name: 'PinInput' })
  .attrs({ tag: 'div', direction: 'inline', gap: 2 })
  .theme(() => ({}))
  .sizes((t) => ({
    small: { gap: t.spacing.xxSmall },
    medium: { gap: t.spacing.xxSmall },
    large: { gap: t.spacing.xSmall },
  }))

export default PinInput

export const PinInputCell = el
  .config({ name: 'PinInputCell' })
  .attrs({ tag: 'input' })
  .theme((t) => ({
    width: '40px',
    height: '40px',
    textAlign: 'center',
    fontSize: t.fontSize.medium,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[300],
    borderRadius: t.borderRadius.base,
    backgroundColor: t.color.system.light.base,
    color: t.color.system.dark[800],
    outline: 'none',
    transition: t.transition.fast,
    focus: {
      borderColor: t.color.system.primary.base,
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
    },
  }))
  .sizes((t) => ({
    small: { width: '36px', height: '36px', fontSize: t.fontSize.base },
    medium: { width: '40px', height: '40px', fontSize: t.fontSize.medium },
    large: { width: '48px', height: '48px', fontSize: t.fontSize.large },
  }))
