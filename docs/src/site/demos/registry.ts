import type { ComponentFn } from '@pyreon/core'
import { DEMOS_APP } from './registry.app'
import { DEMOS_CORE } from './registry.core'
import { DEMOS_DATA } from './registry.data'
import { DEMOS_TOOLS } from './registry.tools'

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
 * to the registry file of its product group (registry.core.ts, registry.data.ts,
 * registry.app.ts or registry.tools.ts), so groups can be built in parallel. A content file whose demo has no entry renders the section without a
 * demo, and the build test lists which ids are still missing one.
 */
export const DEMOS: Readonly<Record<string, ComponentFn>> = {
  ...DEMOS_CORE,
  ...DEMOS_DATA,
  ...DEMOS_APP,
  ...DEMOS_TOOLS,
}
