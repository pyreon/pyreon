/**
 * `defineComponent` — a terse authoring layer for the common case, so declaring
 * a component is a fraction of the raw `ComponentIntelligence` boilerplate.
 *
 * A `PropSpec` is either a primitive kind (`'string'` / `'number'` / `'boolean'`
 * / `'color'` / `'accessor'`) or a string-literal union (a `readonly string[]`,
 * which becomes a `select` control AND — unless you pass explicit `axes` — a
 * variant axis). A prop name ending in `?` is optional; everything else is
 * required. Controls + axes are derived for you.
 *
 * Real file-scanning discovery (the future `auto` scanner) produces the same
 * `ComponentIntelligence`; this is the manual/typed path, usable today.
 */
import type { ComponentIntelligence, ComponentRef, PropShape, PropType, VariantAxis } from '../core'
import { inferControls } from '../core'

/** Primitive prop kinds a spec may name directly. */
export type PropSpecType = 'string' | 'number' | 'boolean' | 'color' | 'accessor'

/** A prop's shape: a primitive kind, or a string-literal union → select + axis. */
export type PropSpec = PropSpecType | readonly string[]

export interface ComponentSpec {
  /** props keyed by name (append `?` to the name to mark optional) */
  props?: Record<string, PropSpec>
  /** explicit variant axes; when omitted, union props become axes automatically */
  axes?: Record<string, readonly string[]>
  /** the component itself (optional metadata) */
  component?: ComponentRef
  tags?: readonly string[]
  summary?: string
}

/** Split a trailing `?` optional marker off a prop name. */
function stripOptional(rawName: string): { name: string; optional: boolean } {
  return rawName.endsWith('?')
    ? { name: rawName.slice(0, -1), optional: true }
    : { name: rawName, optional: false }
}

function toPropShape(rawName: string, spec: PropSpec): PropShape {
  const { name, optional } = stripOptional(rawName)
  const type: PropType = typeof spec === 'string' ? spec : { union: spec }
  return optional ? { name, type, optional } : { name, type }
}

/** Build a `ComponentIntelligence` from a terse spec. */
export function defineComponent(name: string, spec: ComponentSpec = {}): ComponentIntelligence {
  const entries = Object.entries(spec.props ?? {})
  const controls = inferControls(entries.map(([rawName, propSpec]) => toPropShape(rawName, propSpec)))

  const axes: VariantAxis[] = []
  if (spec.axes) {
    for (const [axisName, values] of Object.entries(spec.axes)) axes.push({ name: axisName, values })
  } else {
    for (const [rawName, propSpec] of entries) {
      if (typeof propSpec !== 'string') {
        axes.push({ name: stripOptional(rawName).name, values: propSpec })
      }
    }
  }

  const ci: ComponentIntelligence = {
    name,
    controls,
    axes,
    reactivity: [],
    scenarios: [],
    tags: spec.tags ?? [],
  }
  if (spec.component) ci.component = spec.component
  if (spec.summary) ci.summary = spec.summary
  return ci
}
