import type { ComponentFn } from '@pyreon/core'
import { island } from '@pyreon/zero'

// Demos for the "core and platform" product group. See registry.ts for the rules.
const DemoReactivity = island(() => import('./DemoReactivity'), { name: 'DemoReactivity', hydrate: 'visible', prefetch: 'idle' })
const DemoZero = island(() => import('./DemoZero'), { name: 'DemoZero', hydrate: 'visible', prefetch: 'idle' })
const DemoNative = island(() => import('./DemoNative'), { name: 'DemoNative', hydrate: 'visible', prefetch: 'idle' })
const DemoRouter = island(() => import('./DemoRouter'), { name: 'DemoRouter', hydrate: 'visible', prefetch: 'idle' })
const DemoKinetic = island(() => import('./DemoKinetic'), { name: 'DemoKinetic', hydrate: 'visible', prefetch: 'idle' })
const DemoHooks = island(() => import('./DemoHooks'), { name: 'DemoHooks', hydrate: 'visible', prefetch: 'idle' })
const DemoDesign = island(() => import('./DemoDesign'), { name: 'DemoDesign', hydrate: 'visible', prefetch: 'idle' })
const DemoContent = island(() => import('./DemoContent'), { name: 'DemoContent', hydrate: 'visible', prefetch: 'idle' })
const DemoPrimitives = island(() => import('./DemoPrimitives'), { name: 'DemoPrimitives', hydrate: 'visible', prefetch: 'idle' })
const DemoA11y = island(() => import('./DemoA11y'), { name: 'DemoA11y', hydrate: 'visible', prefetch: 'idle' })

export const DEMOS_CORE: Readonly<Record<string, ComponentFn>> = {
  DemoReactivity,
  DemoA11y,
  DemoZero,
  DemoNative,
  DemoRouter,
  DemoContent,
  DemoPrimitives,
  DemoKinetic,
  DemoHooks,
  DemoDesign,
}
