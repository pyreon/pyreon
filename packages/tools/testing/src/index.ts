/**
 * `@pyreon/testing` — official testing utilities for Pyreon.
 *
 * A thin adapter over `@testing-library/dom` (the shared foundation under
 * React/Vue/Solid/Svelte testing) — so the whole Testing-Library API works
 * exactly as you know it — PLUS Pyreon-native additions: a `render` that mounts
 * a Pyreon component, `renderHook`, `cleanup`, and reactive-native matchers
 * that read Pyreon's fine-grained reactive graph (assertions no DOM-only
 * testing library can express).
 *
 *   Pyreon-native : render, cleanup, renderHook + the reactive matchers.
 *   Re-exported    : screen, fireEvent, waitFor, within, all queries, prettyDOM,
 *                    … straight from @testing-library/dom.
 */

// ── Pyreon-native: mount + lifecycle + hooks ──────────────────────────────
export { render } from './render'
export type { RenderOptions, RenderResult } from './render'
export { cleanup } from './cleanup'
export { renderHook } from './render-hook'
export type { RenderHookOptions, RenderHookResult } from './render-hook'

// ── The full @testing-library/dom surface, verbatim ───────────────────────
// screen / fireEvent / waitFor / within / queries / getByRole (real ARIA +
// accessible-name) / prettyDOM / etc. — the exact API a Testing-Library user
// already knows, with the ecosystem's battle-tested edge-case handling.
export {
  buildQueries,
  configure,
  createEvent,
  fireEvent,
  getByAltText,
  getByDisplayValue,
  getByLabelText,
  getByPlaceholderText,
  getByRole,
  getByTestId,
  getByText,
  getByTitle,
  getConfig,
  getDefaultNormalizer,
  getNodeText,
  getQueriesForElement,
  getRoles,
  isInaccessible,
  logRoles,
  prettyDOM,
  queries,
  queryHelpers,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/dom'
export type {
  BoundFunctions,
  ByRoleMatcher,
  ByRoleOptions,
  Matcher,
  MatcherOptions,
  Queries,
  waitForOptions,
} from '@testing-library/dom'

// ── Pyreon-native: reactive graph matchers (the differentiator) ───────────
export { expectEffect, expectSignal } from './reactive'
export type { EffectAssertions, SignalAssertions } from './reactive'
