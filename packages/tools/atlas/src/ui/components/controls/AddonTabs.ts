import { el, type T } from '../../kit'

export const AddonTabs = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    display: 'flex',
    flexDirection: 'row',
    // Eleven addon tabs never fit a 352px panel — wrap instead of the old
    // overflowX:auto, whose hidden scroll clipped half the strip with no
    // affordance that more tabs existed.
    flexWrap: 'wrap',
    padding: '6px 8px',
    gap: '2px',
    borderBottom: t.hairline,
  }))
