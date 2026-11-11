import type { ComponentFn } from '@pyreon/core'
import { island } from '@pyreon/zero'

// Demos for the "data and state" product group. See registry.ts for the rules.
const DemoForm = island(() => import('./DemoForm'), { name: 'DemoForm', hydrate: 'visible', prefetch: 'idle' })

export const DEMOS_DATA: Readonly<Record<string, ComponentFn>> = {
  DemoForm,
}
