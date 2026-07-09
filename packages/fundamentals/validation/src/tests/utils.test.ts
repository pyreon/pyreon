/**
 * flattenIssuePath — the SINGLE canonical Standard-Schema issue-path
 * flattener (consolidated from three inline copies: standardSchemaToValidator,
 * wrapStandardSchema, and the per-adapter map(String) variants — identical by
 * luck, not construction; every consumer keys on this exact dot-string format,
 * so a drifted copy silently mis-routes errors).
 */
import { describe, expect, it } from 'vitest'
import { flattenIssuePath } from '../utils'

describe('flattenIssuePath — the single canonical issue-path flattener', () => {
  it('flattens plain segments to a dot-string', () => {
    expect(flattenIssuePath(['address', 'city'])).toBe('address.city')
    expect(flattenIssuePath(['items', 0, 'name'])).toBe('items.0.name')
  })

  it('flattens Standard Schema {key} objects (and mixed forms)', () => {
    expect(flattenIssuePath([{ key: 'address' }, { key: 'city' }])).toBe('address.city')
    expect(flattenIssuePath(['address', { key: 'city' }])).toBe('address.city')
  })

  it('absent/empty path is the whole-form key ""', () => {
    expect(flattenIssuePath(undefined)).toBe('')
    expect(flattenIssuePath([])).toBe('')
  })
})
