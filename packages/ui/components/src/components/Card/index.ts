import { el } from '../../factory'

const Card = el
  .config({ name: 'Card' })
  .attrs({ tag: 'div', direction: 'rows',
    contentDirection: 'rows',
    contentAlignX: 'left',
    contentAlignY: 'center', block: true })
  .theme((t) => ({
    backgroundColor: t.color.system.light.base,
    borderRadius: t.borderRadius.medium,
    padding: t.spacing.medium,
  }))
  .variants((t) => ({
    elevated: { boxShadow: t.shadows.small },
    outline: {
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: t.color.system.base[200],
    },
    filled: {
      backgroundColor: t.color.system.base[50],
    },
  }))

export default Card

/**
 * Full-bleed section — cancels Card's padding on both sides (the Mantine
 * `Card.Section` semantic) so images/dividers span edge to edge. Margins
 * mirror Card's `padding: t.spacing.medium`.
 */
export const CardSection = el
  .config({ name: 'CardSection' })
  .attrs({ tag: 'div', block: true })
  .theme((t) => ({
    marginLeft: `-${t.spacing.medium}px`,
    marginRight: `-${t.spacing.medium}px`,
  }))

/** Padded header row with a bottom divider. */
export const CardHeader = el
  .config({ name: 'CardHeader' })
  .attrs({ tag: 'div', direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center', alignY: 'center', block: true })
  .theme((t) => ({
    paddingBottom: t.spacing.small,
    marginBottom: t.spacing.small,
    borderWidthBottom: t.borderWidth.base,
    borderStyleBottom: t.borderStyle.base,
    borderColorBottom: t.color.system.base[200],
    fontWeight: t.fontWeight.semibold,
  }))

/** Padded footer row with a top divider. */
export const CardFooter = el
  .config({ name: 'CardFooter' })
  .attrs({ tag: 'div', direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center', alignY: 'center', block: true })
  .theme((t) => ({
    paddingTop: t.spacing.small,
    marginTop: t.spacing.small,
    borderWidthTop: t.borderWidth.base,
    borderStyleTop: t.borderStyle.base,
    borderColorTop: t.color.system.base[200],
  }))
