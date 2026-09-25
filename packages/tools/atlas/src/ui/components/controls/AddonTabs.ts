import { el } from '../../kit'

export const AddonTabs = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 2,
  })
  .theme((t) => ({
    // ONE row that scrolls sideways. Wrapping cost ~115px of panel height
    // (three rows of twelve tabs); the old overflow had no affordance that
    // more tabs existed, so the edge that has more now FADES (`data-fade`,
    // written by the view from the scroll position) and the active tab is
    // scrolled into view.
    flex: 'none',
    padding: '8px',
    borderBottom: t.hairline,
    extendCss:
      'flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;scroll-padding:0 24px;' +
      '&::-webkit-scrollbar{display:none;}' +
      '&[data-fade="right"]{mask-image:linear-gradient(to right,#000 calc(100% - 48px),transparent);}' +
      '&[data-fade="left"]{mask-image:linear-gradient(to left,#000 calc(100% - 48px),transparent);}' +
      '&[data-fade="both"]{mask-image:linear-gradient(to right,transparent,#000 48px,#000 calc(100% - 48px),transparent);}',
  }))
