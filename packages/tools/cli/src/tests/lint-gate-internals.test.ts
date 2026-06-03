/**
 * Coverage tests for lint gate exported internals.
 *
 * `_mapLintSeverity` covers the severity-mapping branches that the
 * gate runner exercises only when lint emits 'error' / 'warning' / 'info'.
 * The 'off' / unknown-string paths return null (the gate runner then
 * skips the diagnostic) — testing them directly here closes the
 * defensive branches that an end-to-end lint invocation can't reach
 * (the runner never emits diagnostics with severity 'off').
 */
import { describe, expect, it } from 'vitest'
import { _mapLintSeverity } from '../doctor/gates/lint'

describe('_mapLintSeverity', () => {
  it('maps "error" → "error"', () => {
    expect(_mapLintSeverity('error')).toBe('error')
  })

  it('maps "warn" → "warning"', () => {
    expect(_mapLintSeverity('warn')).toBe('warning')
  })

  it('maps "info" → "info"', () => {
    expect(_mapLintSeverity('info')).toBe('info')
  })

  it('returns null for "off"', () => {
    expect(_mapLintSeverity('off')).toBeNull()
  })

  it('returns null for unknown severity strings', () => {
    expect(_mapLintSeverity('unknown')).toBeNull()
    expect(_mapLintSeverity('')).toBeNull()
    expect(_mapLintSeverity('warning')).toBeNull() // not the canonical input
  })
})
