import { allRules } from "../rules/index"
import type { LintConfig, PresetName, Severity } from "../types"

/** Build a config where every rule uses its default severity. */
function buildRecommended(): LintConfig {
  const rules: Record<string, Severity> = {}
  for (const rule of allRules) {
    rules[rule.meta.id] = rule.meta.severity
  }
  return { rules }
}

/** Build a config where every warn is promoted to error. */
function buildStrict(): LintConfig {
  const base = buildRecommended()
  const rules: Record<string, Severity> = {}
  for (const [id, sev] of Object.entries(base.rules)) {
    rules[id] = sev === "warn" ? "error" : sev
  }
  return { rules }
}

/** Build app config — recommended but disable library-only rules. */
function buildApp(): LintConfig {
  const base = buildRecommended()
  return {
    rules: {
      ...base.rules,
      "pyreon/dev-guard-warnings": "off",
      "pyreon/no-error-without-prefix": "off",
      "pyreon/no-circular-import": "off",
      "pyreon/no-cross-layer-import": "off",
    },
  }
}

/** Build lib config — strict + all architecture rules as error. */
function buildLib(): LintConfig {
  const base = buildStrict()
  return {
    rules: {
      ...base.rules,
      "pyreon/no-circular-import": "error",
      "pyreon/no-cross-layer-import": "error",
      "pyreon/dev-guard-warnings": "error",
      "pyreon/no-error-without-prefix": "error",
    },
  }
}

const presetBuilders: Record<PresetName, () => LintConfig> = {
  recommended: buildRecommended,
  strict: buildStrict,
  app: buildApp,
  lib: buildLib,
}

export function getPreset(name: PresetName): LintConfig {
  return presetBuilders[name]()
}

export { buildApp, buildLib, buildRecommended, buildStrict }
