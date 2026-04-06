import { TabsBase, TabBase, TabPanelBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { tabsTheme, tabTheme, tabPanelTheme } from './theme'

const Tabs = createComponent('Tabs', TabsBase, tabsTheme)
export default Tabs

export const Tab = createComponent('Tab', TabBase, tabTheme)
export const TabPanel = createComponent('TabPanel', TabPanelBase, tabPanelTheme)
