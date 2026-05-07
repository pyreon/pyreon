import { hydrateIslandsAuto } from '@pyreon/server/client'
// @ts-expect-error virtual module — provided by @pyreon/vite-plugin
import * as autoRegistry from 'virtual:pyreon/islands-registry'

// Auto-discovers `island()` declarations in src/ via @pyreon/vite-plugin's
// `virtual:pyreon/islands-registry`. No manual sync between island() names
// and a hydrateIslands({ ... }) registry — the #1 author foot-gun closed.
//
// `hydrate: 'never'` islands (e.g. StaticBadge) are deliberately omitted
// from the auto-registry — their components stay out of the client bundle.
// `hydrate: 'interaction'` islands (e.g. CommandPalette) are picked up
// automatically.
hydrateIslandsAuto(autoRegistry)
