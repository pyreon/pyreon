// The sentence a screen reader READS, for every family.
//
// Written after printing them all and finding four that said "1 flows",
// "1 links", "1 tasks", "1 boxes" — and one that announced a task starting on
// the 1st as starting on the previous 31st, because it read out the AXIS
// domain (the tasks' range padded so the bars do not touch the frame) in a
// sentence whose words say "1 task from X to Y".
//
// A `<desc>` is not checked by any other gate: it renders, it is well-formed,
// and nothing looks at the words. So the words are what this asserts.
import { describe, expect, it } from 'vitest'
import { ganttToSvg, graphToSvg, sankeyToSvg } from './family-svg'
import { boxplotToSvg } from './boxplot-svg'

const desc = (svg: string): string => (svg.match(/<desc[^>]*>([^<]*)</) ?? [])[1] ?? ''
const S = { width: 480, height: 280, title: 'T' }

describe('family descriptions read as English', () => {
  it('a single flow, link, task and box are singular', () => {
    expect(desc(sankeyToSvg({ nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 5 }], ...S })))
      .toBe('T: 2 nodes, 1 flow totalling 5.')
    expect(desc(graphToSvg({ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }], ...S })))
      .toBe('T: 2 nodes, 1 link.')
    expect(desc(ganttToSvg({ tasks: [{ id: '1', name: 'D', start: '2024-01-01', end: '2024-01-10' }], ...S })))
      .toBe('T: 1 task from 2024-01-01 to 2024-01-10.')
    expect(desc(boxplotToSvg({ data: [{ g: 'A', obs: [1, 2, 3, 4, 5] }], values: (d) => d.obs, x: (d) => d.g, ...S })))
      .toBe('T: 1 box, median 3.')
  })

  it('and plural where they should be — the singular form is not hardcoded', () => {
    expect(desc(sankeyToSvg({ nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 3 }], ...S })))
      .toContain('2 flows')
    expect(desc(graphToSvg({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], links: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }], ...S })))
      .toContain('2 links')
    expect(desc(boxplotToSvg({ data: [{ g: 'A', obs: [1, 2, 3] }, { g: 'B', obs: [4, 5, 6] }], values: (d) => d.obs, x: (d) => d.g, ...S })))
      .toContain('2 boxes, medians')
  })

  it("the gantt sentence reports the TASKS' extent, not the padded axis", () => {
    // The axis pads by a quarter unit so the bars do not touch the frame.
    // Reading that out described the padding as if it were the work.
    const d = desc(ganttToSvg({
      tasks: [
        { id: '1', name: 'D', start: '2024-03-04', end: '2024-03-08' },
        { id: '2', name: 'B', start: '2024-03-06', end: '2024-03-20' },
      ],
      ...S,
    }))
    expect(d).toBe('T: 2 tasks from 2024-03-04 to 2024-03-20.')
  })
})
