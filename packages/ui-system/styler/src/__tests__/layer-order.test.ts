import { describe, expect, it } from 'vitest'
import { LAYER_ORDER, LAYER_ORDER_STATEMENT } from '../sheet'

describe('the layer order statement', () => {
  it('is the literal form of LAYER_ORDER', () => {
    expect(LAYER_ORDER_STATEMENT).toBe(`@layer ${LAYER_ORDER.join(', ')};`)
  })
})
