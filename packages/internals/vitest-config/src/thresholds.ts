/**
 * Per-category coverage threshold defaults.
 *
 * These match the current organic spread observed across the monorepo
 * (verified empirically pre-migration: range 70-95% across 14 override
 * sites; the per-category number is the modal value seen in that
 * category's packages today).
 *
 * Outliers stay explicit at the call site via `coverageThresholds: {...}`
 * override in `defineNodeConfig({...})`. The override merges over the
 * category default — partial overrides (e.g. `{ branches: 70 }`) keep
 * the other 3 metrics at the category default.
 *
 * The category-name → percent mapping is the SINGLE source of truth.
 * Updating a category default here flows to every package that doesn't
 * supply an explicit per-call override.
 */
export interface CoverageThresholds {
  statements: number
  branches: number
  functions: number
  lines: number
}

export type PackageCategory = 'core' | 'fundamentals' | 'ui' | 'tools' | 'zero' | 'internals'

export const CATEGORY_DEFAULTS: Record<PackageCategory, CoverageThresholds> = {
  core: { statements: 90, branches: 90, functions: 90, lines: 90 },
  fundamentals: { statements: 85, branches: 80, functions: 85, lines: 85 },
  ui: { statements: 80, branches: 75, functions: 80, lines: 80 },
  tools: { statements: 80, branches: 75, functions: 80, lines: 80 },
  zero: { statements: 80, branches: 75, functions: 80, lines: 80 },
  internals: { statements: 90, branches: 90, functions: 90, lines: 90 },
}

export function resolveThresholds(
  category: PackageCategory | undefined,
  override: Partial<CoverageThresholds> | undefined,
): CoverageThresholds {
  const base = category
    ? CATEGORY_DEFAULTS[category]
    : // `@vitus-labs/tools-vitest`'s own 90/90/90/90 default — preserved
      // when no category is supplied (back-compat for the 6 configs that
      // currently skip createVitestConfig).
      { statements: 90, branches: 90, functions: 90, lines: 90 }
  return { ...base, ...override }
}
