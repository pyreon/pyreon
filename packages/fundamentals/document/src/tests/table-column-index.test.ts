import { describe, expect, it } from 'vitest'
import { render } from '../render'

/**
 * Locks that the teams / discord table renderers map cell values to the correct
 * column after switching from `columns.indexOf(col)` (O(cols) per cell, O(n²))
 * to the loop index (O(1)). A wrong index would misalign every column, so these
 * assert a distinguishable value lands under its own header.
 */
describe('document table renderers — column indexing', () => {
  const doc = {
    type: 'document' as const,
    children: [
      {
        type: 'table' as const,
        props: {
          columns: [{ header: 'A' }, { header: 'B' }, { header: 'C' }],
          rows: [
            ['a0', 'b0', 'c0'],
            ['a1', 'b1', 'c1'],
          ],
        },
        children: [],
      },
    ],
  }

  it('teams: each cell value stays under its own column', async () => {
    const out = await render(doc as never, 'teams')
    const s = typeof out === 'string' ? out : JSON.stringify(out)
    // Column-major: the 'A' column's items are a0,a1; 'C' column's are c0,c1.
    // A misalignment (e.g. all columns reading col 0) would drop b*/c* entirely.
    expect(s).toContain('a0')
    expect(s).toContain('b1')
    expect(s).toContain('c0')
    expect(s).toContain('c1')
  })

})
