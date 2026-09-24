/**
 * Every coding-agent tool gets the repo's instructions and MCP server from its
 * own config file. They must all point at the same things, or one tool
 * silently runs without the server (or without AGENTS.md) while the others
 * work. The MCP entry is derived from `@pyreon/mcp`'s own `bin`, so moving the
 * server's output fails here instead of in someone's editor.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../../../..')
const read = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

const mcpPkg = read('packages/tools/mcp/package.json')
const ENTRY = join('packages/tools/mcp', mcpPkg.bin['pyreon-mcp'])

// Each config file, and how to pull the pyreon server's launch string out of it.
const CONFIGS: Array<{ file: string; launch: (json: any) => string }> = [
  { file: '.mcp.json', launch: (j) => j.mcpServers.pyreon.args.join(' ') },
  { file: '.vscode/mcp.json', launch: (j) => j.servers.pyreon.args.join(' ') },
  { file: '.cursor/mcp.json', launch: (j) => j.mcpServers.pyreon.args.join(' ') },
  { file: '.gemini/settings.json', launch: (j) => j.mcpServers.pyreon.args.join(' ') },
]

describe('coding-agent tool configs', () => {
  it('derives the MCP entry from @pyreon/mcp bin', () => {
    expect(ENTRY).toBe('packages/tools/mcp/lib/index.js')
  })

  for (const { file, launch } of CONFIGS) {
    it(`${file} launches the @pyreon/mcp entry`, () => {
      expect(existsSync(join(ROOT, file)), `${file} is missing`).toBe(true)
      expect(launch(read(file))).toContain(ENTRY)
    })
  }

  it('Gemini CLI reads AGENTS.md, and CLAUDE.md imports it', () => {
    expect(read('.gemini/settings.json').contextFileName).toBe('AGENTS.md')
    expect(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8').split('\n')[0]).toBe('@AGENTS.md')
    expect(existsSync(join(ROOT, 'AGENTS.md'))).toBe(true)
  })
})
