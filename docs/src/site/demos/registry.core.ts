import type { ComponentFn } from '@pyreon/core'
import { island } from '@pyreon/zero'

// Demos for the "core and platform" product group. See registry.ts for the rules.
const DemoReactivity = island(() => import('./DemoReactivity'), { name: 'DemoReactivity', hydrate: 'visible', prefetch: 'idle' })
const DemoZero = island(() => import('./DemoZero'), { name: 'DemoZero', hydrate: 'visible', prefetch: 'idle' })
const DemoNative = island(() => import('./DemoNative'), { name: 'DemoNative', hydrate: 'visible', prefetch: 'idle' })
const DemoA11y = island(() => import('./DemoA11y'), { name: 'DemoA11y', hydrate: 'visible', prefetch: 'idle' })

export const DEMOS_CORE: Readonly<Record<string, ComponentFn>> = {
  DemoReactivity,
  DemoA11y,
  DemoZero,
  DemoNative,
}
