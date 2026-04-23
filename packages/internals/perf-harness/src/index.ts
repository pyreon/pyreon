/**
 * @pyreon/perf-harness — internal dev-time instrumentation.
 *
 * Framework packages import ONLY `_count` from this entry. Consumers of
 * the harness (examples, dev tools, scripts) import `perfHarness` or
 * `install` for the full API. The split keeps the hot write path small
 * and uncoupled from the consumer-facing API.
 *
 * Every call to `_count` at a framework call site MUST be guarded with
 * `import.meta.env?.DEV === true` so prod bundles tree-shake the call.
 * The write function itself is also a no-op until `install()` /
 * `perfHarness.enable()` is called — a second line of defence.
 */

export { _count, _reset, _snapshot, _enable, _disable, _isEnabled } from './counters'
export type { CounterName } from './counters'

export { diffSnapshots, formatDiff } from './diff'
export type { CounterDiff, CounterDiffEntry } from './diff'

export { perfHarness, install, uninstall } from './harness'
export type { PerfHarness } from './harness'
