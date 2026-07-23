/**
 * The component catalog. Rich control metadata drives the workshop UI; a real
 * Atlas Catalog Graph (built synchronously) powers search — so the workshop is
 * genuinely Atlas-powered.
 */
import { createCatalogGraph, inferControls } from '@pyreon/atlas/core'
import type { PropShape } from '@pyreon/atlas/core'

export type ControlType = 'text' | 'enum' | 'bool'

export interface Control {
  key: string
  label: string
  type: ControlType
  options?: readonly string[]
  default: unknown
}

export interface Comp {
  id: string
  name: string
  status: string
  isNew?: boolean
  desc: string
  controls: readonly Control[]
}

export interface Group {
  group: string
  num: string
  items: readonly Comp[]
}

export const GROUPS: readonly Group[] = [
  {
    group: 'Foundations',
    num: '01',
    items: [
      {
        id: 'button', name: 'Button', status: 'stable',
        desc: 'The primary action trigger, in four visual variants and three sizes.',
        controls: [
          { key: 'label', label: 'Label', type: 'text', default: 'Get started' },
          { key: 'variant', label: 'Variant', type: 'enum', options: ['solid', 'soft', 'outline', 'ghost'], default: 'solid' },
          { key: 'size', label: 'Size', type: 'enum', options: ['sm', 'md', 'lg'], default: 'md' },
          { key: 'icon', label: 'Leading icon', type: 'bool', default: false },
        ],
      },
      {
        id: 'badge', name: 'Badge', status: 'stable',
        desc: 'Compact status and metadata labels.',
        controls: [
          { key: 'label', label: 'Label', type: 'text', default: 'New' },
          { key: 'variant', label: 'Variant', type: 'enum', options: ['soft', 'solid', 'outline'], default: 'soft' },
          { key: 'dot', label: 'Leading dot', type: 'bool', default: true },
        ],
      },
      {
        id: 'input', name: 'Text field', status: 'stable',
        desc: 'Single-line text entry with label, helper text and validation states.',
        controls: [
          { key: 'label', label: 'Label', type: 'text', default: 'Email address' },
          { key: 'placeholder', label: 'Placeholder', type: 'text', default: 'you@studio.com' },
          { key: 'state', label: 'State', type: 'enum', options: ['default', 'focus', 'error'], default: 'default' },
          { key: 'helper', label: 'Helper', type: 'text', default: 'We will never share it.' },
        ],
      },
      {
        id: 'toggle', name: 'Toggle', status: 'stable', isNew: true,
        desc: 'Binary on/off switch for settings and preferences.',
        controls: [
          { key: 'label', label: 'Label', type: 'text', default: 'Enable notifications' },
          { key: 'on', label: 'On', type: 'bool', default: true },
        ],
      },
    ],
  },
]

export const ALL: readonly Comp[] = GROUPS.flatMap((g) => g.items)

export function compById(id: string): Comp {
  return ALL.find((c) => c.id === id) ?? ALL[0]!
}

export function defaultValues(c: Comp): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const ctrl of c.controls) out[ctrl.key] = ctrl.default
  return out
}

export const totalCount = ALL.length

// ── real Atlas Catalog Graph (synchronous) for search ──────────────────────
function toShapes(c: Comp): PropShape[] {
  return c.controls.map((ctrl) => ({
    name: ctrl.key,
    type: ctrl.type === 'enum' ? { union: ctrl.options ?? [] } : ctrl.type === 'bool' ? 'boolean' : 'string',
  }))
}

const graph = createCatalogGraph(
  ALL.map((c) => ({
    name: c.name,
    controls: inferControls(toShapes(c)),
    axes: [],
    reactivity: [],
    scenarios: [],
    tags: ['foundations'],
  })),
)

/** Ranked ids matching a query (Atlas-powered), or all ids when blank. */
export function searchIds(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (q === '') return ALL.map((c) => c.id)
  const names = new Set(graph.search(q).map((h) => h.component))
  return ALL.filter((c) => names.has(c.name) || c.id.includes(q)).map((c) => c.id)
}
