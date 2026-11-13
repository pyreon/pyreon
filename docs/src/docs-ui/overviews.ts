import overviewsJson from '../site/content/_docs-overviews.json'
import type { Overview } from './nav'

/**
 * The per-product overview slots of `_docs.json` in full (cross-sells, the
 * "coming from" library, notes). Only the selling slots read it, and they
 * load on overview pages only; what every page needs (which page is an
 * overview, the rail's product) is the small `_docs-index.json` in `nav.ts`.
 */
export const OVERVIEWS: readonly Overview[] = overviewsJson as Overview[]
