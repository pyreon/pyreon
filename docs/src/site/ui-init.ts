import { init } from '@pyreon/ui-core'
// unistyle registers its theme engine (enrichment + CSS-variable emission)
// into ui-core when it loads. Import it before the first <PyreonUI> renders so
// the root provider never falls back to the identity engine.
import '@pyreon/unistyle'

/**
 * Runs once per process (server) and once per page (client), before any kit
 * component resolves its theme. CSS-variables mode makes every
 * `mode(light, dark)` pair one custom property switched by `<html data-theme>`,
 * which is what lets the prerendered HTML serve both themes and the pre-paint
 * script pick one with no flash. Must be imported before `<PyreonUI>` renders:
 * the root layout imports it first.
 */
init({ cssVariables: { attribute: 'data-theme' } })
