import type { ComponentFn } from '@pyreon/core'
import { island } from '@pyreon/zero'

// Demos for the "app building blocks" product group. See registry.ts for the rules.
// Light demos prefetch at idle; @pyreon/table and @pyreon/virtual load only
// when their demo nears the viewport (no prefetch), so no other page pays for them;
// so do the heavier app demos (feature brings @pyreon/query and zod, dnd its drag library).
const DemoFeature = island(() => import('./DemoFeature'), { name: 'DemoFeature', hydrate: 'visible' })
const DemoI18n = island(() => import('./DemoI18n'), { name: 'DemoI18n', hydrate: 'visible', prefetch: 'idle' })
const DemoPermissions = island(() => import('./DemoPermissions'), { name: 'DemoPermissions', hydrate: 'visible', prefetch: 'idle' })
const DemoUrlstate = island(() => import('./DemoUrlstate'), { name: 'DemoUrlstate', hydrate: 'visible', prefetch: 'idle' })
const DemoHotkeys = island(() => import('./DemoHotkeys'), { name: 'DemoHotkeys', hydrate: 'visible', prefetch: 'idle' })
const DemoRx = island(() => import('./DemoRx'), { name: 'DemoRx', hydrate: 'visible', prefetch: 'idle' })
const DemoDnd = island(() => import('./DemoDnd'), { name: 'DemoDnd', hydrate: 'visible' })
const DemoToast = island(() => import('./DemoToast'), { name: 'DemoToast', hydrate: 'visible', prefetch: 'idle' })
const DemoTable = island(() => import('./DemoTable'), { name: 'DemoTable', hydrate: 'visible' })
const DemoVirtual = island(() => import('./DemoVirtual'), { name: 'DemoVirtual', hydrate: 'visible' })

export const DEMOS_APP: Readonly<Record<string, ComponentFn>> = {
  DemoFeature,
  DemoI18n,
  DemoPermissions,
  DemoUrlstate,
  DemoHotkeys,
  DemoRx,
  DemoDnd,
  DemoToast,
  DemoTable,
  DemoVirtual,
}
