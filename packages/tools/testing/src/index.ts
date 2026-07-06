/**
 * `@pyreon/testing` — official testing utilities for Pyreon.
 *
 * Tier 1 (this + PRs 2–3): Testing-Library-style `render` / `screen` /
 * `fireEvent` / `waitFor` / `cleanup` / `renderHook`.
 * Tier 2 (PRs 4–5): reactive-native matchers (`expectSignal` / `expectEffect`
 * / `expectGarbageCollected`) that read Pyreon's reactive graph — assertions
 * impossible in DOM-only testing libraries.
 */
export { render } from './render'
export type { RenderOptions, RenderResult } from './render'
export { screen } from './screen'
export { cleanup } from './cleanup'
export type { BoundQueries, TextMatch, WaitOptions } from './queries'
