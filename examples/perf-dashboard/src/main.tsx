/**
 * Entry point. In dev, auto-installs the perf-harness so counters are live
 * from first paint — no "click here to start measuring" step that would
 * miss the boot phase where most interesting things happen.
 *
 * The Playwright record script (scripts/perf/record.ts) depends on this
 * auto-install to capture counter values via `page.evaluate(() =>
 * __pyreon_perf__.snapshot())`.
 */
import { h } from '@pyreon/core'
import { install } from '@pyreon/perf-harness'
import { mount } from '@pyreon/runtime-dom'
import { App } from './App'

interface ViteMeta {
  readonly env?: { readonly DEV?: boolean }
}
if ((import.meta as ViteMeta).env?.DEV === true) {
  install()
}

const root = document.getElementById('app')
if (!root) throw new Error('#app root element missing')
mount(h(App, null), root)
