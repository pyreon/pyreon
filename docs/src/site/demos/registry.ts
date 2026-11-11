import type { ComponentFn } from '@pyreon/core'
import { island } from '@pyreon/zero'

/**
 * Live demos for product pages, keyed by the content file's `demo.component`.
 *
 * Each demo is a zero island: the product page itself is static HTML with a
 * small hydration footprint, and a demo's JavaScript (and the package it
 * sells: @pyreon/form, @pyreon/a11y, …) loads only on the page that shows it,
 * when it scrolls near the viewport. Every demo uses the real package it
 * sells (the brief's rule).
 *
 * Adding a product: write `Demo<Name>.tsx` (default export) and add one line
 * here. A content file whose demo has no entry renders the section without a
 * demo, and the build test lists which ids are still missing one.
 */
const DemoForm = island(() => import('./DemoForm'), { name: 'DemoForm', hydrate: 'visible', prefetch: 'idle' })
const DemoReactivity = island(() => import('./DemoReactivity'), { name: 'DemoReactivity', hydrate: 'visible', prefetch: 'idle' })
const DemoA11y = island(() => import('./DemoA11y'), { name: 'DemoA11y', hydrate: 'visible', prefetch: 'idle' })

export const DEMOS: Readonly<Record<string, ComponentFn>> = {
  DemoForm,
  DemoReactivity,
  DemoA11y,
}
