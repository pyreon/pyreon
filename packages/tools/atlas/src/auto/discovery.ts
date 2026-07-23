/**
 * `components({...})` — wrap a set of terse component specs into a discovery
 * plugin. This is the whole "authoring" you write today:
 *
 *   createAtlas({
 *     plugins: [
 *       components({
 *         Button: { props: { label: 'string', state: ['primary', 'secondary'] }, tags: ['form'] },
 *       }),
 *     ],
 *   })
 */
import type { AtlasPlugin } from '../plugins'
import { defineAtlasPlugin } from '../plugins'
import type { ComponentSpec } from './define-component'
import { defineComponent } from './define-component'

export function components(defs: Record<string, ComponentSpec>): AtlasPlugin {
  const list = Object.entries(defs).map(([name, spec]) => defineComponent(name, spec))
  return defineAtlasPlugin({
    name: 'atlas:components',
    discover: () => list,
  })
}
