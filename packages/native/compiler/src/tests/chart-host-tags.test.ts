import { describe, expect, it } from 'vitest'
import { ACCESSOR_CHART_HOSTS, CHART_HOSTS, FRAME_CHART_HOSTS, GRAMMAR_CONFIG_TAGS, GRAMMAR_FAMILY_TAGS, GRAMMAR_INDICATOR_TAGS, GRAMMAR_MARK_TAGS, chartHostTags, isChartHostTag } from '../chart-hosts'
import { createRegistries } from '../active-registries'
import { BUILT_IN_PLUGINS } from '../built-in-plugins'

// The `@pyreon/charts` plugin claims `chartHostTags()`; the parser still tests `isChartHostTag`.
// Two lists for one set would drift the day a host is added to one, so they are derived from the
// same tables and compared here in both directions.
describe('chartHostTags', () => {
  const tags = chartHostTags()

  it('is exactly the set isChartHostTag accepts', () => {
    for (const tag of tags) expect(isChartHostTag(tag), tag).toBe(true)
    const everyTable = [
      ...Object.keys(CHART_HOSTS),
      ...Object.keys(ACCESSOR_CHART_HOSTS),
      ...Object.keys(FRAME_CHART_HOSTS),
      'Chart',
      ...Object.keys(GRAMMAR_MARK_TAGS),
      ...Object.keys(GRAMMAR_INDICATOR_TAGS),
      ...Object.keys(GRAMMAR_FAMILY_TAGS),
      ...GRAMMAR_CONFIG_TAGS,
    ]
    for (const tag of everyTable) expect(tags, tag).toContain(tag)
    for (const tag of ['Stack', 'Text', 'ChartThemeProvider', 'PyreonUI', 'toString', 'constructor']) {
      expect(isChartHostTag(tag), tag).toBe(false)
      expect(tags).not.toContain(tag)
    }
  })

  it('has no duplicates (two claims of one (module, tag) pair would be a load-time error)', () => {
    expect(new Set(tags).size).toBe(tags.length)
  })

  it('is what the built-in @pyreon/charts plugin claims, from @pyreon/charts', () => {
    const { elements } = createRegistries([...BUILT_IN_PLUGINS])
    const claimed = elements.entries.filter((e) => e.owner === '@pyreon/charts')
    expect(claimed).toHaveLength(1)
    expect(claimed[0]!.lowering.module).toBe('@pyreon/charts')
    expect([...claimed[0]!.lowering.tags].sort()).toEqual([...tags].sort())
    // Both targets emit from the plugin: neither emitter keeps a chart branch of its own.
    expect(claimed[0]!.lowering.emit?.swift).toBeTypeOf('function')
    expect(claimed[0]!.lowering.emit?.kotlin).toBeTypeOf('function')
  })
})
