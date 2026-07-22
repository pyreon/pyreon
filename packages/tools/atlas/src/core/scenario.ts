/**
 * Scenario identity + construction helpers. A scenario id is a stable slug so
 * the same derived state keeps the same id across runs (diff-friendly for both
 * humans and agents).
 */
import type { Scenario, ScenarioSource } from './types'

/** Lowercase, hyphenate, strip anything that is not `[a-z0-9-]`, collapse runs. */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // collapses any run of non-alphanumerics to one hyphen
    .replace(/^-+|-+$/g, '')
}

/** `<component>--<name>` — stable and unique within a component's scenario set. */
export function scenarioId(component: string, name: string): string {
  const c = slugify(component)
  const n = slugify(name)
  return n ? `${c}--${n}` : c
}

export interface ScenarioInit {
  component: string
  name: string
  args?: Record<string, unknown>
  variant?: Record<string, string>
  source?: ScenarioSource
}

/** Build a scenario, filling the id + defaults. */
export function makeScenario(init: ScenarioInit): Scenario {
  const scenario: Scenario = {
    id: scenarioId(init.component, init.name),
    component: init.component,
    name: init.name,
    args: init.args ?? {},
    source: init.source ?? 'authored',
  }
  if (init.variant !== undefined) scenario.variant = init.variant
  return scenario
}
