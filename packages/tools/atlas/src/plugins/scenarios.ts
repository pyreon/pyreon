/**
 * Built-in scenario-generation plugins. Each derives additional verified
 * scenarios from a component's metadata (no rendering required) — the core of
 * Atlas's "zero-authoring" automation. All are pure, order-independent, and
 * dedupe by scenario id so an authored/AI scenario is never overwritten.
 */
import type { AtlasPlugin } from './types'
import { makeScenario } from '../core'
import { defineAtlasPlugin } from './define'

/** Append scenarios to a component, skipping any whose id already exists. */
function appendScenarios(
  ci: Parameters<NonNullable<AtlasPlugin['decorate']>>[0],
  make: () => ReturnType<typeof makeScenario>[],
) {
  const existing = new Set(ci.scenarios.map((s) => s.id))
  const generated = make().filter((s) => !existing.has(s.id))
  if (generated.length === 0) return ci
  return { ...ci, scenarios: [...ci.scenarios, ...generated] }
}

/**
 * Ensures every component has at least one scenario. Runs late (after the
 * generators) so it only fills a component that produced none of its own.
 */
export function defaultScenarioPlugin(): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:default-scenario',
    decorate(ci) {
      if (ci.scenarios.length > 0) return ci
      return {
        ...ci,
        scenarios: [makeScenario({ component: ci.name, name: 'Default', source: 'auto-default' })],
      }
    },
  })
}

/** Boolean props whose `true` state is worth its own scenario. */
const STATE_PROPS = [
  'disabled',
  'loading',
  'readonly',
  'checked',
  'selected',
  'active',
  'error',
  'required',
  'open',
  'expanded',
] as const

export interface StatesOptions {
  /** override the watched boolean prop names */
  props?: readonly string[]
}

/** One scenario per interactive boolean state prop the component declares. */
export function statesPlugin(options: StatesOptions = {}): AtlasPlugin {
  const watch = new Set(options.props ?? STATE_PROPS)
  return defineAtlasPlugin({
    name: 'atlas:states',
    decorate(ci) {
      const stateControls = ci.controls.filter((c) => c.kind === 'boolean' && watch.has(c.name))
      if (stateControls.length === 0) return ci
      return appendScenarios(ci, () =>
        stateControls.map((c) =>
          makeScenario({
            component: ci.name,
            name: c.name,
            args: { [c.name]: true },
            source: 'auto-variant',
          }),
        ),
      )
    },
  })
}

export interface EdgeCaseOptions {
  /** the string used for the "long content" scenario */
  longText?: string
}

const DEFAULT_LONG =
  'The quick brown fox jumps over the lazy dog, and keeps going well past the edge to exercise wrapping and overflow.'

/** Empty + long-content scenarios for the component's primary text prop. */
export function edgeCasesPlugin(options: EdgeCaseOptions = {}): AtlasPlugin {
  const long = options.longText ?? DEFAULT_LONG
  return defineAtlasPlugin({
    name: 'atlas:edge-cases',
    decorate(ci) {
      const text = ci.controls.find((c) => c.kind === 'text')
      if (!text) return ci
      return appendScenarios(ci, () => [
        makeScenario({ component: ci.name, name: 'Empty', args: { [text.name]: '' }, source: 'auto-variant' }),
        makeScenario({ component: ci.name, name: 'Long content', args: { [text.name]: long }, source: 'auto-variant' }),
      ])
    },
  })
}

export interface ThemeOptions {
  /** theme modes to generate a scenario for (default `['dark']`) */
  modes?: readonly string[]
}

/**
 * A scenario per theme mode (pinned via the `theme` variant). Opt-in — not in
 * the recommended bundle, since a bare per-mode scenario is only meaningful
 * once the runtime renders it under the mode.
 */
export function themePlugin(options: ThemeOptions = {}): AtlasPlugin {
  const modes = options.modes ?? ['dark']
  return defineAtlasPlugin({
    name: 'atlas:theme',
    decorate(ci) {
      return appendScenarios(ci, () =>
        modes.map((mode) =>
          makeScenario({
            component: ci.name,
            name: `Theme ${mode}`,
            variant: { theme: mode },
            source: 'auto-variant',
          }),
        ),
      )
    },
  })
}
