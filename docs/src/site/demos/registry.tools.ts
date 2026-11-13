import type { ComponentFn } from '@pyreon/core'
import { island } from '@pyreon/zero'

// Demos for the "visual and tools" product group. See registry.ts for the rules.
// @pyreon/charts, @pyreon/flow, the editors and @pyreon/document load only
// when their demo nears the viewport (no prefetch), so no other page pays for them.
const DemoCharts = island(() => import('./DemoCharts'), { name: 'DemoCharts', hydrate: 'visible' })
const DemoEditor = island(() => import('./DemoEditor'), { name: 'DemoEditor', hydrate: 'visible' })
const DemoFlow = island(() => import('./DemoFlow'), { name: 'DemoFlow', hydrate: 'visible' })
const DemoDocument = island(() => import('./DemoDocument'), { name: 'DemoDocument', hydrate: 'visible' })
const DemoAtlas = island(() => import('./DemoAtlas'), { name: 'DemoAtlas', hydrate: 'visible', prefetch: 'idle' })
const DemoLathe = island(() => import('./DemoLathe'), { name: 'DemoLathe', hydrate: 'visible', prefetch: 'idle' })
const DemoLoom = island(() => import('./DemoLoom'), { name: 'DemoLoom', hydrate: 'visible', prefetch: 'idle' })
const DemoTooling = island(() => import('./DemoTooling'), { name: 'DemoTooling', hydrate: 'visible', prefetch: 'idle' })
const DemoAi = island(() => import('./DemoAi'), { name: 'DemoAi', hydrate: 'visible', prefetch: 'idle' })
const DemoMigrate = island(() => import('./DemoMigrate'), { name: 'DemoMigrate', hydrate: 'visible', prefetch: 'idle' })

export const DEMOS_TOOLS: Readonly<Record<string, ComponentFn>> = {
  DemoCharts,
  DemoEditor,
  DemoFlow,
  DemoDocument,
  DemoAtlas,
  DemoLathe,
  DemoLoom,
  DemoTooling,
  DemoAi,
  DemoMigrate,
}
