// The ONE adapter from a Playwright `Page` to the `PageLike` the perf-dashboard journeys are written against.
//
// It exists because the cast it replaces (`page as unknown as PageLike`) hid a heap retention in the harness itself.
// `PageLike.waitForSelector` returns nothing, but Playwright's returns an ElementHandle, and an undisposed handle is
// a GC root for the whole browser session. Every journey ends by waiting for its "ready" marker, so the leak sweep
// pinned one marker per cycle — and through its parent, every DOM node the cycle had just unmounted. That reads as a
// framework leak: the nightly sweep went red on 5 journeys from 2026-10-16, when a correct runtime change (#3902,
// rows of a `<For>` whose parent leaves as a unit stay attached to that detached parent) made the pinned marker
// reach the whole list instead of an empty shell. Nothing in the framework held it.
//
// So every method here is implemented on purpose, and none hands a handle back: waiting goes through
// `locator().waitFor()`, which creates no handle.

import type { Page } from 'playwright'
import type { PageLike } from '../../examples/perf-dashboard/src/journeys'

export function toPageLike(page: Page): PageLike {
  return {
    click: (selector) => page.click(selector),
    fill: (selector, value) => page.fill(selector, value),
    waitForSelector: (selector) => page.locator(selector).first().waitFor({ state: 'attached' }),
    evaluate: (fn) => page.evaluate(fn),
    reload: (opts) => page.reload(opts as Parameters<Page['reload']>[0]),
  }
}
