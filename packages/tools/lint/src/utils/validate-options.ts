/**
 * Validate a rule's user-configured options against its declared schema.
 *
 * Called once per (rule, options) pair at config-merge time — NOT per
 * lint'd file. Separates config problems from source-code problems:
 * wrong-typed options aren't a file diagnostic, they're a setup error
 * for the tool.
 *
 * Return shape:
 *   - `errors`:   hard failures. Runner disables the rule for this run.
 *   - `warnings`: unknown option keys, typos, etc. Runner keeps the
 *                 rule enabled but prints the warning so the user knows.
 *
 * Rules without `meta.schema` accept any options (no validation).
 */

import type { OptionType, Rule, RuleOptions, RuleOptionsSchema } from '../types'

export interface ValidationResult {
  errors: string[]
  warnings: string[]
}

export function validateRuleOptions(rule: Rule, options: RuleOptions): ValidationResult {
  const schema = rule.meta.schema
  const errors: string[] = []
  const warnings: string[] = []
  if (!schema) return { errors, warnings }

  for (const [key, value] of Object.entries(options)) {
    const expected = schema[key]
    if (expected === undefined) {
      warnings.push(
        `[${rule.meta.id}] unknown option "${key}" — allowed options: ${Object.keys(schema).join(', ') || '(none)'}`,
      )
      continue
    }
    if (!matchesType(value, expected)) {
      errors.push(
        `[${rule.meta.id}] option "${key}" must be ${expected}, got ${describe(value)}`,
      )
    }
  }

  return { errors, warnings }
}

function matchesType(value: unknown, type: OptionType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'string[]':
      return Array.isArray(value) && value.every((x) => typeof x === 'string')
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    const types = new Set(value.map((x) => (x === null ? 'null' : typeof x)))
    return `Array<${[...types].join(' | ') || 'empty'}>`
  }
  return typeof value
}
