import { hydrateIslandsAuto } from '@pyreon/server/client'
import * as registry from 'virtual:pyreon/islands-registry'
import { followSystemMode } from './color-mode'

/**
 * Client for static marketing pages (see `render-mode.ts`): hydrates the
 * `<pyreon-island>` elements present in the HTML, each with its own strategy,
 * and keeps the colour mode following the OS while the visitor has not chosen
 * one. Nothing else runs: the page around the islands stays server HTML.
 */
hydrateIslandsAuto(registry)
followSystemMode()
