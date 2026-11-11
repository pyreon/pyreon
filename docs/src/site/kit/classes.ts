/**
 * Class names of the plain stylesheet islands use (`site-css.ts`). Islands
 * import only this map, never the stylesheet, so an island's chunk carries a
 * few strings instead of a styling runtime.
 */
export const C = {
  srOnly: 's-sr',
  isCurrent: 's-current',

  header: 's-header',
  bar: 's-bar',
  mark: 's-mark',
  wordmark: 's-wordmark',
  crumbs: 's-crumbs',
  nav: 's-nav',
  navLink: 's-navlink',
  spacer: 's-spacer',
  iconLink: 's-iconlink',
  iconButton: 's-iconbtn',
  menuButton: 's-menubtn',
  desktopOnly: 's-desktop',
  modeDark: 's-mode-dark',
  modeLight: 's-mode-light',
  pill: 's-pill',
  pillSolid: 's-pill-solid',

  panel: 's-panel',
  panelWide: 's-panel-wide',
  panelNarrow: 's-panel-narrow',
  columns4: 's-cols4',
  columns2: 's-cols2',
  colTitle: 's-coltitle',
  list: 's-list',
  item: 's-item',
  itemName: 's-item-name',
  itemSub: 's-item-sub',
  badge: 's-badge',
  panelFoot: 's-panelfoot',

  sheet: 's-sheet',
  sheetList: 's-sheetlist',
  bigLink: 's-biglink',
  groupTitle: 's-grouptitle',
  sheetGrid: 's-sheetgrid',
  smallLink: 's-smalllink',
  sheetInstall: 's-sheetinstall',
  sheetFoot: 's-sheetfoot',

  cmd: 's-cmd',
  cmdHot: 's-cmd-hot',
  cmdText: 's-cmd-text',
  cmdPrompt: 's-cmd-prompt',
  copy: 's-copy',
} as const
