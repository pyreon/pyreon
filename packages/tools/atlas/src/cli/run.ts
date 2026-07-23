/**
 * The `atlas` CLI — point Atlas at a project and get a verified catalog + an AI
 * agent guide, from one command. Uses real file-scanning discovery (#discover)
 * + the recommended plugin pipeline + the AI-assets generator, end-to-end.
 *
 * Output uses `process.stdout`/`stderr` (not `console`) so it stays lint-clean
 * outside the CLI-package allowlist. `runScan` is pure (returns data + writes
 * files); `runCli` is the thin arg-parsing + printing layer a bin invokes.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAtlas } from '../index'
import type { AgentAsset } from '../plugins'
import { aiAssetsPlugin, recommendedPlugins } from '../plugins'
import type { DiscoverOptions } from '../discover'
import { fileDiscoveryPlugin } from '../discover'

export interface ScanOptions extends DiscoverOptions {
  /** output directory for the catalog + guide, relative to cwd (default '.') */
  out?: string
  /** write atlas-catalog.json + atlas-agent-guide.md (default true) */
  write?: boolean
}

export interface ScanResult {
  components: number
  scenarios: number
  flagged: number
  guide: string
  llms: string
  catalogPath?: string
  guidePath?: string
}

/** Discover a project's components, build the verified catalog, emit assets. */
export async function runScan(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd ?? '.'
  let asset: AgentAsset | undefined
  const graph = await createAtlas({
    cwd,
    plugins: [
      fileDiscoveryPlugin({ ...options, cwd }),
      ...recommendedPlugins(),
      aiAssetsPlugin({
        onAsset: (a) => {
          asset = a
        },
      }),
    ],
  }).build()

  const scenarios = graph.scenarios()
  const result: ScanResult = {
    components: graph.size(),
    scenarios: scenarios.length,
    flagged: scenarios.filter((s) => s.verify && !s.verify.ok).length,
    guide: asset ? asset.guide : graph.toAgentGuide(),
    llms: asset ? asset.llms : graph.toLlmsText(),
  }

  if (options.write !== false && graph.size() > 0) {
    const outDir = join(cwd, options.out ?? '.')
    result.catalogPath = join(outDir, 'atlas-catalog.json')
    result.guidePath = join(outDir, 'atlas-agent-guide.md')
    writeFileSync(result.catalogPath, JSON.stringify(graph.toJSON(), null, 2))
    writeFileSync(result.guidePath, result.guide)
  }
  return result
}

const HELP = `atlas — component workshop + catalog for the Pyreon ecosystem

Usage:
  atlas scan [dir]    discover components under <dir>/src, build a verified
                      catalog, and write atlas-catalog.json + atlas-agent-guide.md
  atlas --help        show this help
`

function out(text: string): void {
  process.stdout.write(text)
}
function err(text: string): void {
  process.stderr.write(text)
}

/** Parse argv + run a command. Returns the process exit code. */
export async function runCli(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    out(HELP)
    return 0
  }

  if (cmd === 'scan') {
    const dir = rest.find((a) => !a.startsWith('-'))
    const result = await runScan({ cwd: dir ?? '.' })
    if (result.components === 0) {
      err(`atlas: no components found under ${join(dir ?? '.', 'src')}\n`)
      return 1
    }
    out(
      `atlas: discovered ${result.components} component(s), ${result.scenarios} verified ` +
        `scenario(s) (${result.flagged} flagged).\n`,
    )
    if (result.catalogPath) out(`  → ${result.catalogPath}\n  → ${result.guidePath}\n`)
    return 0
  }

  err(`atlas: unknown command "${cmd}". Try \`atlas --help\`.\n`)
  return 1
}
