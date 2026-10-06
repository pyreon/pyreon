/**
 * Scenario identity + construction helpers. A scenario id is a stable slug so
 * the same derived state keeps the same id across runs (diff-friendly for both
 * humans and agents).
 */
import { componentKey } from './identity'
import type { Scenario, ScenarioSource } from './types'

/** Lowercase, hyphenate, strip anything that is not `[a-z0-9-]`, collapse runs. */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // collapses any run of non-alphanumerics to one hyphen
    // The collapse above guarantees no consecutive hyphens, so a single `-` at
    // each anchor is enough — avoids the `-+` quantifier that CodeQL flags as a
    // polynomial-ReDoS on uncontrolled input (js/polynomial-redos).
    .replace(/^-|-$/g, '')
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
  play?: import('./types').PlayFn
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
  if (init.play !== undefined) scenario.play = init.play
  return scenario
}

/**
 * Scenario ids that occur more than once across a set of components.
 *
 * Ids are the join key between the Node catalog, the browser run's verdicts and
 * the snapshot filenames, so a duplicate is not cosmetic: the second scenario's
 * verdict overwrites the first's and one baseline PNG serves two scenarios.
 * Returned as `id → owning component keys` so the message can name both.
 */
export function duplicateScenarioIds(
  components: readonly { name: string; project?: string; pathQualifier?: string; scenarios: readonly { id: string }[] }[],
): Map<string, string[]> {
  const owners = new Map<string, string[]>()
  for (const c of components) {
    const key = componentKey(c)
    for (const s of c.scenarios) {
      const list = owners.get(s.id)
      if (list) list.push(key)
      else owners.set(s.id, [key])
    }
  }
  for (const [id, list] of owners) if (list.length < 2) owners.delete(id)
  return owners
}
