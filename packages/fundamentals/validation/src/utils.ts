import type { ValidationError } from '@pyreon/form'
import type { ValidationIssue } from './types'

/**
 * Convert an array of validation issues into a flat field → error record.
 * For nested paths like ["address", "city"], produces "address.city".
 * When multiple issues exist for the same path, the first message wins.
 */
export function issuesToRecord<TValues extends Record<string, unknown>>(
  issues: ValidationIssue[],
): Partial<Record<keyof TValues, ValidationError>> {
  const errors = {} as Partial<Record<keyof TValues, ValidationError>>
  for (const issue of issues) {
    const key = issue.path as keyof TValues
    // First error per field wins
    if (errors[key] === undefined) {
      errors[key] = issue.message
    }
  }
  return errors
}
