import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadAtlasConfig } from '../config'

const dirs: string[] = []
const withConfig = async (source: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-cfg-parts-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'atlas.config.js'), source)
  return loadAtlasConfig(dir)
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe('atlas.config — parts and browserOnly', () => {
  it('accepts a part→parent map and a browserOnly name list', async () => {
    const loaded = await withConfig(
      "export default { parts: { TabPanel: 'Tabs', AccordionContent: 'Accordion' }, browserOnly: ['Dialog', 'Modal'] }",
    )
    expect(loaded.error).toBeUndefined()
    expect(loaded.config.parts).toEqual({ TabPanel: 'Tabs', AccordionContent: 'Accordion' })
    expect(loaded.config.browserOnly).toEqual(['Dialog', 'Modal'])
  })

  it('names a malformed `parts` instead of silently dropping the key', async () => {
    expect((await withConfig("export default { parts: ['TabPanel'] }")).error).toContain('parts')
    expect((await withConfig('export default { parts: { TabPanel: 1 } }')).error).toContain('parts')
  })

  it('names a malformed `browserOnly`', async () => {
    expect((await withConfig("export default { browserOnly: 'Dialog' }")).error).toContain('browserOnly')
  })
})
