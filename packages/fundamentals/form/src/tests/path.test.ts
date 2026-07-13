import { describe, expect, it } from 'vitest'
import {
  findPathAncestorConflict,
  flattenValues,
  nearestAncestorField,
  nestValues,
} from '../path'

describe('nearestAncestorField (pure)', () => {
  it('returns the top-level object field ancestor', () => {
    expect(nearestAncestorField('address.city', new Set(['address']))).toBe('address')
  })
  it('prefers the MOST specific (deepest) ancestor field', () => {
    expect(nearestAncestorField('a.b.c', new Set(['a', 'a.b']))).toBe('a.b')
  })
  it('returns undefined when no ancestor is registered', () => {
    expect(nearestAncestorField('address.city', new Set(['email']))).toBeUndefined()
  })
  it('returns undefined for a dotless key', () => {
    expect(nearestAncestorField('email', new Set(['email']))).toBeUndefined()
  })
  it('does NOT treat a shared prefix without a dot boundary as an ancestor', () => {
    // `addressLine2.foo`'s ancestor is `addressLine2`, never `address`.
    expect(nearestAncestorField('addressLine2.foo', new Set(['address']))).toBeUndefined()
  })
})

describe('findPathAncestorConflict (pure)', () => {
  it('flags an object field + a leaf under it', () => {
    expect(findPathAncestorConflict(['address', 'address.city'])).toEqual(['address', 'address.city'])
  })
  it('flags a deep object field + a leaf under it', () => {
    expect(findPathAncestorConflict(['a.b', 'a.b.c'])).toEqual(['a.b', 'a.b.c'])
  })
  it('returns undefined for sibling leaf fields (no ancestor relation)', () => {
    expect(findPathAncestorConflict(['address.city', 'address.zip'])).toBeUndefined()
  })
  it('returns undefined for unrelated fields', () => {
    expect(findPathAncestorConflict(['name', 'email', 'address.city'])).toBeUndefined()
  })
  it('does NOT false-flag a shared prefix without a dot boundary', () => {
    expect(findPathAncestorConflict(['address', 'addressLine2'])).toBeUndefined()
  })
})

describe('nestValues (pure)', () => {
  it('nests dot-path keys into objects', () => {
    expect(nestValues({ name: 'a', 'address.city': 'NYC', 'address.zip': '10001' })).toEqual({
      name: 'a',
      address: { city: 'NYC', zip: '10001' },
    })
  })
  it('builds arrays for numeric segments', () => {
    expect(nestValues({ 'tags.0': 'x', 'tags.1': 'y' })).toEqual({ tags: ['x', 'y'] })
  })
  it('handles arrays of objects', () => {
    expect(nestValues({ 'items.0.name': 'a', 'items.1.name': 'b' })).toEqual({
      items: [{ name: 'a' }, { name: 'b' }],
    })
  })
  it('handles deep nesting', () => {
    expect(nestValues({ 'a.b.c.d': 1 })).toEqual({ a: { b: { c: { d: 1 } } } })
  })
  it('passes through a dotless flat object unchanged', () => {
    expect(nestValues({ email: 'e', age: 3 })).toEqual({ email: 'e', age: 3 })
  })
  it('preserves an explicit null/undefined leaf value', () => {
    expect(nestValues({ 'a.b': null, 'a.c': undefined })).toEqual({ a: { b: null, c: undefined } })
  })
  it('does NOT pollute the prototype via a crafted __proto__ key', () => {
    nestValues({ '__proto__.polluted': 'yes', 'constructor.prototype.x': 'yes' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
    // legitimate keys alongside a forbidden one still work
    expect(nestValues({ 'a.b': 1, '__proto__.evil': 2 })).toEqual({ a: { b: 1 } })
  })
})

describe('flattenValues (pure)', () => {
  it('flattens nested objects to dot-path keys', () => {
    expect(flattenValues({ name: 'a', address: { city: 'NYC', zip: '10001' } })).toEqual({
      name: 'a',
      'address.city': 'NYC',
      'address.zip': '10001',
    })
  })
  it('flattens arrays with numeric-index keys', () => {
    expect(flattenValues({ items: [{ name: 'a' }, { name: 'b' }] })).toEqual({
      'items.0.name': 'a',
      'items.1.name': 'b',
    })
  })
  it('keeps a Date as a single leaf (does not recurse)', () => {
    const d = new Date(0)
    expect(flattenValues({ createdAt: d })).toEqual({ createdAt: d })
  })
  it('keeps an empty object/array as a leaf (lossless)', () => {
    expect(flattenValues({ a: {}, b: [] })).toEqual({ a: {}, b: [] })
  })
})

describe('nest / flatten round-trip', () => {
  it('nestValues ∘ flattenValues is identity for a nested payload', () => {
    const nested = {
      name: 'a',
      address: { city: 'NYC', zip: '10001' },
      tags: ['x', 'y'],
      meta: { flags: { active: true } },
    }
    expect(nestValues(flattenValues(nested))).toEqual(nested)
  })
  it('flattenValues ∘ nestValues is identity for a flat dot-path record', () => {
    const flat = { name: 'a', 'address.city': 'NYC', 'items.0.id': 1 }
    expect(flattenValues(nestValues(flat))).toEqual(flat)
  })
})
