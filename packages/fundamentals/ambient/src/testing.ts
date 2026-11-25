/**
 * `@pyreon/ambient/testing` — test hooks that reset the ambient state between tests.
 *
 * Call them in `afterEach`: `resetClockState()` drops every ticker, the `setClock` pin, the provide flag and the
 * server hand-over; `resetLocaleState()` forgets the memoized runtime locale and zone, the provide flags, the app
 * defaults and the printed warnings.
 *
 * @example resetClockState() // in afterEach
 */
export { resetClockState } from './clock'
export { resetLocaleState } from './locale'
