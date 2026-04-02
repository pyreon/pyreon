import { TabsBase, TabBase, TabPanelBase } from '@pyreon/ui-primitives'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { tabsTheme, tabTheme, tabPanelTheme } from './theme'

const tsResolved = getComponentTheme(tabsTheme)

const Tabs = rocketstyle({ useBooleans: true })({
  name: 'Tabs',
  component: TabsBase as any,
})
  .theme(tsResolved.base)

export default Tabs

const tResolved = getComponentTheme(tabTheme)

export const Tab = rocketstyle({ useBooleans: true })({
  name: 'Tab',
  component: TabBase as any,
})
  .theme(tResolved.base)

const tpResolved = getComponentTheme(tabPanelTheme)

export const TabPanel = rocketstyle({ useBooleans: true })({
  name: 'TabPanel',
  component: TabPanelBase as any,
})
  .theme(tpResolved.base)
