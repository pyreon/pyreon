/**
 * Finding codes loom no longer emits, with what replaced them. A config that
 * still names one (a `loom.severity` key, a `loom.ignore` entry's `code`) gets
 * this targeted message instead of a generic unknown-code list, or — for an
 * ignore entry — instead of silently matching nothing.
 */
export const RETIRED_CODES: Readonly<Record<string, string>> = {
  'peer-mismatch':
    '`peer-mismatch` was retired in 0.54: `internal-range` covers that edge. A bare internal peer range that also misses the workspace major is one `internal-range` finding, at least a warning, with `details.peerMajorMismatch: true`. Rename the key to `internal-range`, or delete it.',
}

/** The retirement message for `code`, or undefined when it is not retired. */
export function retiredCodeMessage(code: unknown): string | undefined {
  return typeof code === 'string' && Object.hasOwn(RETIRED_CODES, code) ? RETIRED_CODES[code] : undefined
}
