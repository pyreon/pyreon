/**
 * `@pyreon/atlas/auto` — the authoring + discovery layer. Today: the terse
 * `defineComponent` / `components({...})` helpers. Next: real file-scanning
 * discovery (extracting components + prop types from source), which produces the
 * same `ComponentIntelligence` these helpers do.
 */
export type { PropSpec, PropSpecType, ComponentSpec } from './define-component'
export { defineComponent } from './define-component'
export { components } from './discovery'
