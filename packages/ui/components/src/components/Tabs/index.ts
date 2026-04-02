import { TabsBase, TabBase, TabPanelBase } from '@pyreon/ui-primitives'
import rocketstyle from '@pyreon/rocketstyle'

const Tabs = rocketstyle({ useBooleans: true })({
  name: 'Tabs',
  component: TabsBase as any,
})
  .theme({
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  })

export const Tab = rocketstyle({ useBooleans: true })({
  name: 'Tab',
  component: TabBase as any,
})
  .theme({
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 16,
    paddingRight: 16,
    fontSize: 14,
    cursor: 'pointer',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    color: '#6b7280',
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    ':hover': {
      color: '#374151',
    },
    '&[data-active]': {
      borderBottomColor: '#3b82f6',
      color: '#2563eb',
      fontWeight: 500,
    },
  })
  .variants({
    line: {
      borderBottomWidth: 2,
    },
    enclosed: {
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#e5e7eb',
      borderBottomWidth: 0,
      borderTopLeftRadius: 6,
      borderTopRightRadius: 6,
      '&[data-active]': {
        borderColor: '#e5e7eb',
        borderBottomColor: '#ffffff',
        color: '#2563eb',
        fontWeight: 500,
      },
    },
    pills: {
      borderBottomWidth: 0,
      borderRadius: 6,
      '&[data-active]': {
        backgroundColor: '#eff6ff',
        color: '#2563eb',
        fontWeight: 500,
        borderBottomColor: 'transparent',
      },
    },
  })

export const TabPanel = rocketstyle({ useBooleans: true })({
  name: 'TabPanel',
  component: TabPanelBase as any,
})
  .theme({
    padding: 16,
  })

export default Tabs
