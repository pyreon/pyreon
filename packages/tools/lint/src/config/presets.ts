import type { LintConfig, Severity } from "../types"
import { allRules } from "../rules"

/**
 * Build a config from all rules using their default severities.
 */
function defaultConfig(): Record<string, Severity> {
  const rules: Record<string, Severity> = {}
  for (const rule of allRules) {
    rules[rule.meta.id] = rule.meta.defaultSeverity
  }
  return rules
}

/**
 * Recommended preset — all rules at their default severity.
 * Errors catch real bugs. Warnings catch likely mistakes. Info suggests improvements.
 */
export const recommended: LintConfig = {
  rules: defaultConfig(),
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/lib/**",
    "**/.turbo/**",
    "**/coverage/**",
  ],
}

/**
 * Strict preset — all warnings promoted to errors.
 * For CI and pre-commit hooks where you want zero tolerance.
 */
export const strict: LintConfig = {
  rules: Object.fromEntries(
    Object.entries(defaultConfig()).map(([id, severity]) => [
      id,
      severity === "warn" ? "error" : severity,
    ]),
  ),
  exclude: recommended.exclude,
}

/**
 * App preset — recommended + disable library-specific rules.
 * For Pyreon application code (not library packages).
 */
export const app: LintConfig = {
  rules: {
    ...defaultConfig(),
    // Library-specific rules don't apply to app code
    "pyreon/dev-guard-warnings": "off",
    "pyreon/no-error-without-prefix": "off",
    "pyreon/no-circular-import": "off",
    "pyreon/no-cross-layer-import": "off",
    "pyreon/no-deep-import": "warn", // Still warn — deep imports are fragile
    "pyreon/no-children-access": "off",
    "pyreon/prefer-request-context": "off",
    // Performance hints are info-level in apps
    "pyreon/no-eager-import": "info",
  },
  exclude: recommended.exclude,
}

/**
 * Lib preset — strict + extra architecture checks.
 * For Pyreon packages and libraries.
 */
export const lib: LintConfig = {
  rules: {
    ...strict.rules,
    // Extra strict for library code
    "pyreon/no-deep-import": "error",
    "pyreon/no-inline-style-object": "error",
  },
  exclude: recommended.exclude,
}

/** All presets */
export const presets = { recommended, strict, app, lib } as const
