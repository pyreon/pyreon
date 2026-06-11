// @vitest-environment node
/**
 * Phase 5 review follow-up (finding A) — the load-hook WIRING test.
 *
 * The whole "`.server.ts` never reaches the client bundle" guarantee hangs
 * on ONE line in zero's vite plugin: the virtual routes module emits the
 * real `serverLoader: mod.serverLoader` import ONLY when Vite passes
 * `loadOptions.ssr === true` (the SSR module graph), and only the
 * serializable `hasServerLoader: true` marker otherwise (the client graph).
 * The generator itself was tested with explicit options; this test drives
 * the PLUGIN's load hook the way Vite does — so a refactor of that one
 * wiring line fails HERE instead of silently regressing the bundle
 * exclusion (silent degradation mode: SSR graph without the flag → route
 * has the marker but no function → preload skips it → empty data).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { zeroPlugin } from '../vite-plugin'

const RESOLVED_VIRTUAL_ROUTES_ID = '\0virtual:zero/routes'

describe('server-loader SSR wiring — plugin load(id, { ssr })', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function appDir(): string {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-wiring-'))
    mkdirSync(join(dir, 'src/routes'), { recursive: true })
    writeFileSync(
      join(dir, 'src/routes/dash.tsx'),
      'export default function D() { return null }\n',
    )
    writeFileSync(
      join(dir, 'src/routes/dash.server.ts'),
      'export async function serverLoader() { return { secret: 1 } }\n',
    )
    return dir
  }

  type LoadHook = (
    this: unknown,
    id: string,
    options?: { ssr?: boolean },
  ) => Promise<string | undefined>

  async function loadRoutes(ssr: boolean | undefined): Promise<string> {
    const root = appDir()
    const plugins = zeroPlugin({ mode: 'ssr' })
    const main = plugins[0] as {
      configResolved?: (c: { root: string; base: string; build: { assetsInlineLimit?: number; assetsDir?: string } }) => void
      load?: LoadHook
    }
    main.configResolved?.({ root, base: '/', build: {} })
    const code = await main.load?.call(
      {},
      RESOLVED_VIRTUAL_ROUTES_ID,
      ssr === undefined ? undefined : { ssr },
    )
    if (!code) throw new Error('load() returned nothing for the virtual routes id')
    return code
  }

  it('SSR graph (ssr: true) emits the REAL serverLoader import', async () => {
    const code = await loadRoutes(true)
    expect(code).toContain('hasServerLoader: true')
    expect(code).toContain('.serverLoader')
    expect(code).toContain('dash.server')
  })

  it('client graph (ssr: false) emits ONLY the marker — sibling unreachable', async () => {
    const code = await loadRoutes(false)
    expect(code).toContain('hasServerLoader: true')
    expect(code).not.toContain('.serverLoader')
    expect(code).not.toContain('dash.server')
  })

  it('client graph (no loadOptions at all) ALSO emits only the marker', async () => {
    const code = await loadRoutes(undefined)
    expect(code).toContain('hasServerLoader: true')
    expect(code).not.toContain('.serverLoader')
  })
})
