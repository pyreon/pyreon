import { describe, expect, it } from 'vitest'
import { hitToolbox, renderToolbox, toolboxTools } from './toolbox'

describe('toolbox layout', () => {
  it('expands the config in ECharts order: magicType, restore, saveAsImage', () => {
    expect(toolboxTools({ saveAsImage: true, restore: true, magicType: ['line', 'bar'] })).toEqual(['magicLine', 'magicBar', 'restore', 'saveAsImage'])
    expect(toolboxTools({})).toEqual([])
  })
  it('right-aligns buttons, index-aligned boxes, reports its height', () => {
    const tools = toolboxTools({ saveAsImage: true, restore: true })
    const l = renderToolbox(tools, { x: 0, y: 0, w: 300, h: 100 }, { fontSize: 10, color: '#333' })
    expect(l.boxes).toHaveLength(2)
    expect(l.boxes[1]!.x + l.boxes[1]!.w).toBe(300)
    expect(l.boxes[0]!.x).toBeLessThan(l.boxes[1]!.x)
    expect(l.height).toBe(18 + 6)
    expect(l.cmds.filter((c) => c.kind === 'text')).toHaveLength(2)
  })
  it('the active magicType draws a highlight; hit-testing returns the tool', () => {
    const tools = toolboxTools({ magicType: ['line', 'bar'] })
    const l = renderToolbox(tools, { x: 0, y: 0, w: 300, h: 100 }, { fontSize: 10, color: '#333', active: 'magicBar' })
    expect(l.cmds.filter((c) => c.kind === 'rect')).toHaveLength(1)
    const b = l.boxes[1]!
    expect(hitToolbox(tools, l.boxes, b.x + 1, b.y + 1)).toBe('magicBar')
    expect(hitToolbox(tools, l.boxes, 0, 90)).toBeNull()
  })
})
