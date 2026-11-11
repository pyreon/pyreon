import type { ComponentFn } from '@pyreon/core'
import { island } from '@pyreon/zero'

// Demos for the "data and state" product group. See registry.ts for the rules.
const DemoForm = island(() => import('./DemoForm'), { name: 'DemoForm', hydrate: 'visible', prefetch: 'idle' })
const DemoHttp = island(() => import('./DemoHttp'), { name: 'DemoHttp', hydrate: 'visible', prefetch: 'idle' })
const DemoStore = island(() => import('./DemoStore'), { name: 'DemoStore', hydrate: 'visible', prefetch: 'idle' })
const DemoStatetree = island(() => import('./DemoStatetree'), { name: 'DemoStatetree', hydrate: 'visible', prefetch: 'idle' })
const DemoMachine = island(() => import('./DemoMachine'), { name: 'DemoMachine', hydrate: 'visible', prefetch: 'idle' })
const DemoSync = island(() => import('./DemoSync'), { name: 'DemoSync', hydrate: 'visible', prefetch: 'idle' })
const DemoStorage = island(() => import('./DemoStorage'), { name: 'DemoStorage', hydrate: 'visible', prefetch: 'idle' })

export const DEMOS_DATA: Readonly<Record<string, ComponentFn>> = {
  DemoForm,
  DemoHttp,
  DemoStore,
  DemoStatetree,
  DemoMachine,
  DemoSync,
  DemoStorage,
}
