import { describe, expect, it } from 'vitest'
import { buildScaffold } from '../scaffold'

// The AI-agent files are static text, so the failure mode is DRIFT: guidance
// that names a command or primitive the scaffold no longer has. These specs
// tie every command the instructions mention to what the scaffold defines.
describe('buildScaffold — AI agent files', () => {
  const files = buildScaffold({ name: 'my-app' })
  const get = (p: string) => files.find((f) => f.path === p)?.content ?? ''

  it('ships AGENTS.md, CLAUDE.md and .mcp.json', () => {
    const paths = files.map((f) => f.path)
    expect(paths).toContain('AGENTS.md')
    expect(paths).toContain('CLAUDE.md')
    expect(paths).toContain('.mcp.json')
  })

  it('AGENTS.md and CLAUDE.md carry the same instructions, titled with the project name', () => {
    expect(get('AGENTS.md')).toBe(get('CLAUDE.md'))
    expect(get('AGENTS.md').startsWith('# my-app\n')).toBe(true)
  })

  it('registers the Pyreon MCP server as valid JSON', () => {
    const mcp = JSON.parse(get('.mcp.json')) as {
      mcpServers: { pyreon: { command: string; args: string[] } }
    }
    expect(mcp.mcpServers.pyreon).toEqual({ command: 'bunx', args: ['@pyreon/mcp'] })
  })

  it('every `bun run <script>` the instructions name exists in package.json', () => {
    const scripts = (JSON.parse(get('package.json')) as { scripts: Record<string, string> }).scripts
    const named = [...get('AGENTS.md').matchAll(/`bun run ([\w:-]+)`/g)].map((m) => m[1] as string)
    expect(named.length).toBeGreaterThan(0)
    for (const script of named) expect(scripts, `script ${script}`).toHaveProperty(script)
  })

  it('names only pyreon-native subcommands the scaffold scripts also use or the CLI documents', () => {
    expect(get('AGENTS.md')).toContain('npx pyreon-native check --source=src')
    // `check` is the CLI's own verb; `build:ios` runs `pyreon-native build`.
    expect(get('scripts/build-ios.sh')).toContain('pyreon-native build')
  })
})
