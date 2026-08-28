import type { RuleCategory, RuleGroup, RuleMeta } from '../types'

/**
 * Which GROUP each category belongs to.
 *
 * The 19 categories conflate two unrelated axes: what a rule is ABOUT
 * (reactivity, jsx, ssr) and which package it NEEDS (query, rx, i18n). Five of
 * them hold one or two rules each, which makes them tags rather than
 * categories. Groups add the axis that actually decides how a rule is treated:
 * **what knowledge does it require, and does it ship?**
 *
 * Categories are kept underneath, so nothing loses its identity — a query rule
 * is `group: 'pkg'`, `category: 'query'`.
 *
 * Deliberately typed as a TOTAL `Record<RuleCategory, RuleGroup>` rather than a
 * lookup with a fallback. A new category then fails to COMPILE until it is
 * classified, instead of silently defaulting into whichever group happened to
 * be the fallback — the "gate input list is a silent-hole generator" class.
 *
 * There is no `js` or `ts` group yet. Those are for general JS/TS correctness
 * rules, of which this package currently has none; declaring an empty group
 * would advertise coverage that does not exist.
 */
export const CATEGORY_GROUP: Record<RuleCategory, RuleGroup> = {
  // Framework semantics — nothing outside Pyreon can know these.
  reactivity: 'pyreon',
  jsx: 'pyreon',
  lifecycle: 'pyreon',
  performance: 'pyreon',
  ssr: 'pyreon',
  ssg: 'pyreon',
  // `architecture` is genuinely mixed: `dev-guard-warnings` and
  // `no-process-dev-gate` are framework rules any library author wants, while
  // the rest hardcode this repo. The `scope: 'monorepo'` marker resolves that
  // per rule in `groupOf` — the category alone cannot.
  architecture: 'pyreon',
  // Exploitable shapes — reverse tabnabbing, script URLs. Separated from
  // `a11y` and `pyreon` because "is this a vulnerability?" is a different
  // question from "is this idiomatic?", and teams gate on it differently.
  security: 'security',
  // Accessibility — standard markup plus the Pyreon-specific surfaces
  // (toast, dialog, overlay, primitives) no generic linter can see.
  accessibility: 'a11y',
  frontend: 'a11y',
  // Per-library rules. Each self-activates on a declared dependency, so a
  // project only ever sees rules for libraries it actually uses.
  store: 'pkg',
  form: 'pkg',
  styling: 'pkg',
  hooks: 'pkg',
  router: 'pkg',
  query: 'pkg',
  rx: 'pkg',
  i18n: 'pkg',
  storage: 'pkg',
  http: 'pkg',
}

/**
 * The group a rule belongs to.
 *
 * `scope: 'monorepo'` wins over the category map: those rules encode this
 * repository rather than the framework, and that is the single most important
 * fact about them — it is why no shipped preset enables them.
 */
export function groupOf(meta: Pick<RuleMeta, 'category' | 'scope'>): RuleGroup {
  if (meta.scope === 'monorepo') return 'internal'
  return CATEGORY_GROUP[meta.category]
}
