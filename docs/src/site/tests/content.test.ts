import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMOS } from '../demos/registry'
import { splitPayoff, diffStats } from '../kit/code'
import { numeralSize, quoteSize, splitEmber } from '../kit/proof'
import { PRODUCTS } from '../nav'

const dir = resolve(__dirname, '../content/products')
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))

describe('product content in the app', () => {
  it.each(files)('%s is a known product with a wired demo', (file) => {
    const data = JSON.parse(readFileSync(resolve(dir, file), 'utf8'))
    expect(PRODUCTS.map((p) => p.id)).toContain(data.id)
    expect(`${data.id}.json`).toBe(file)
    expect(data.route).toBe(`/products/${data.id}`)
    // Every demo uses the real package; a page whose demo is missing renders without one.
    expect(Object.keys(DEMOS)).toContain(data.demo.component)
    expect(data.hero.facts.length).toBeGreaterThan(0)
  })
})

describe('kit text helpers', () => {
  it('splitEmber finds the one ember word', () => {
    expect(splitEmber('Your component runs once. Ever.', 'Ever.')).toEqual(['Your component runs once. ', 'Ever.', ''])
    expect(splitEmber('No match', 'zzz')).toEqual(['No match', '', ''])
  })
  it('splitPayoff takes the last sentence', () => {
    expect(splitPayoff('Your component runs once. Nothing to memoise.')).toEqual(['Your component runs once. ', 'Nothing to memoise.'])
    expect(splitPayoff('Just one.')).toEqual(['', 'Just one.'])
  })
  it('diffStats counts removed and added lines', () => {
    expect(diffStats([['-', 'a'], ['+', 'b'], [' ', 'c'], ['+', 'd']])).toEqual({ removed: 1, added: 2 })
  })
  it('long numerals and long quotes step down', () => {
    expect(numeralSize('4×')).toBe('default')
    expect(numeralSize('2.0–2.1×')).toBe('long')
    expect(quoteSize('A tie is a tie.')).toBe('default')
    expect(quoteSize('x'.repeat(111))).toBe('long')
  })
})
