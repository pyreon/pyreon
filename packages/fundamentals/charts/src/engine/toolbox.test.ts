import { describe, expect, it } from 'vitest'
import { hitToolbox, renderToolbox, toolboxGlyph } from './toolbox'
import { toolboxTools } from './toolbox-config'
import type { ToolboxTool } from './toolbox-config'

describe('toolbox layout', () => {
  it('expands the config in ECharts order: dataZoom+back, dataView, magicType, brush, restore, saveAsImage', () => {
    expect(toolboxTools({ saveAsImage: true, restore: true, magicType: ['line', 'bar'] })).toEqual(['magicLine', 'magicBar', 'restore', 'saveAsImage'])
    expect(toolboxTools({})).toEqual([])
    expect(toolboxTools({ dataZoom: true, dataView: true })).toEqual(['dataZoom', 'dataZoomBack', 'dataView'])
    expect(toolboxTools({ magicType: ['stack', 'tiled'] })).toEqual(['magicStack', 'magicTiled'])
    expect(toolboxTools({ brush: ['rect', 'polygon', 'lineX', 'lineY', 'keep', 'clear'] })).toEqual(['brushRect', 'brushPolygon', 'brushLineX', 'brushLineY', 'brushKeep', 'brushClear'])
    expect(toolboxTools({ saveAsImage: 'svg' })).toEqual(['saveAsImage'])
    expect(toolboxTools({ saveAsImage: 'png' })).toEqual(['saveAsImage'])
  })
  it('every named tool has its own glyph; an unrecognized name falls back to a placeholder', () => {
    const named: ToolboxTool[] = ['saveAsImage', 'restore', 'magicLine', 'magicBar', 'magicStack', 'magicTiled', 'dataZoom', 'dataZoomBack', 'brushRect', 'brushPolygon', 'brushLineX', 'brushLineY', 'brushKeep', 'brushClear']
    const glyphs = named.map((t) => toolboxGlyph(t))
    expect(new Set(glyphs).size).toBe(named.length) // every tool draws a DISTINCT glyph
    expect(toolboxGlyph('dataView')).toBe('▤') // not individually glyphed — the fallback
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
  it('actives (a SET of currently-on tools, e.g. a held brush mode) also draws its highlight', () => {
    const tools = toolboxTools({ brush: ['rect', 'clear'] })
    const l = renderToolbox(tools, { x: 0, y: 0, w: 300, h: 100 }, { fontSize: 10, color: '#333', actives: ['brushRect'] })
    expect(l.cmds.filter((c) => c.kind === 'rect')).toHaveLength(1)
  })
})
