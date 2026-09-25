/**
 * The GitHub Action on the Lathe docs page, EXECUTED — so it is not untested
 * prose.
 *
 * The workflow YAML is read out of `docs/src/content/docs/lathe.md` itself
 * (edit the docs and this runs the edit), parsed, and every `run:` step after
 * the setup ones is executed with `bash -e` — the shell GitHub uses — in a real
 * git repository whose `main` holds the base spec, with the PR's spec in the
 * working tree. The `${{ … }}` expressions and `if:` conditions are evaluated
 * the way the runner would for the cases that matter; `bunx lathe` runs this
 * package's SOURCE entry, and `gh` is a stub that records its arguments and
 * the comment body. What cannot run here is the hosted part: checkout,
 * setup-bun, `bun install`, and the real GitHub API.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

const REPO = resolve(__dirname, '..', '..', '..', '..', '..')
const DOC = join(REPO, 'docs', 'src', 'content', 'docs', 'lathe.md')
const MAIN = resolve(__dirname, '..', 'cli', 'main.ts')

interface Step {
  name?: string
  uses?: string
  run?: string
  if?: string
  env?: Record<string, string>
}

/** The one ```yaml block under the `lathe diff` section. */
function workflow(): { on: { pull_request: { paths: string[] } }; permissions: Record<string, string>; jobs: Record<string, { steps: Step[] }> } {
  const md = readFileSync(DOC, 'utf8')
  const section = md.slice(md.indexOf('### `lathe diff`'))
  const m = /```yaml\n([\s\S]*?)```/.exec(section)
  if (!m) throw new Error('no yaml block in the `lathe diff` docs section')
  return parse(m[1] as string)
}

const SPEC = (required: string[]) =>
  JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Shop', version: '1' },
    servers: [{ url: 'https://shop.test' }],
    paths: {
      '/pets/{id}': {
        get: {
          operationId: 'getPet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
        },
      },
    },
    components: {
      schemas: {
        Pet: { type: 'object', required, properties: { name: { type: 'string' }, tag: { type: 'string' } } },
      },
    },
  })

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

interface Run {
  code: string | undefined
  ran: string[]
  exit: number
  ghArgs: string | undefined
  commentBody: string | undefined
}

/** Run the workflow's shell steps for a PR whose spec is `head`, against a `main` holding `base`. */
function runWorkflow(base: string, head: string | null): Run {
  const dir = mkdtempSync(join(tmpdir(), 'lathe-action-'))
  roots.push(dir)
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && !k.startsWith('GITHUB_')))
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { env, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t.test')
  git('config', 'user.name', 't')
  writeFileSync(join(dir, 'openapi.yaml'), base)
  git('add', 'openapi.yaml')
  git('commit', '-q', '-m', 'base')
  // `actions/checkout` with fetch-depth 0 gives the base as `origin/<base_ref>`.
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  if (head === null) rmSync(join(dir, 'openapi.yaml'))
  else writeFileSync(join(dir, 'openapi.yaml'), head)

  // PATH shims: `bunx lathe …` runs this package's source; `gh` records.
  const bin = join(dir, '.bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'entry.ts'), `import { main } from ${JSON.stringify(MAIN)}\nprocess.exitCode = await main(process.argv.slice(2), process.cwd())\n`)
  writeFileSync(join(bin, 'bunx'), `#!/bin/sh\n[ "$1" = lathe ] || exit 99\nshift\nexec bun ${JSON.stringify(join(bin, 'entry.ts'))} "$@"\n`)
  writeFileSync(
    join(bin, 'gh'),
    '#!/bin/sh\nprintf "%s " "$@" > "$GH_LOG"\nwhile [ $# -gt 0 ]; do if [ "$1" = --body-file ]; then cp "$2" "$GH_BODY"; fi; shift; done\n[ -n "$GH_TOKEN" ] || exit 4\n',
  )
  chmodSync(join(bin, 'bunx'), 0o755)
  chmodSync(join(bin, 'gh'), 0o755)

  const output = join(dir, '.github_output')
  writeFileSync(output, '')
  const outputs = (): Record<string, string> =>
    Object.fromEntries(
      readFileSync(output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  const expr = (text: string): string =>
    text.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_m, e: string) => {
      if (e === 'github.base_ref') return 'main'
      if (e === 'github.event.pull_request.number') return '42'
      if (e === 'github.token') return 'tok'
      const out = /^steps\.diff\.outputs\.(\w+)$/.exec(e)
      if (out) return outputs()[out[1] as string] ?? ''
      throw new Error(`unhandled expression ${e}`)
    })
  /** `steps.diff.outputs.code != '0'` — the only condition shape the workflow uses. */
  const condition = (c: string): boolean => {
    const m = /^steps\.diff\.outputs\.(\w+) (!=|==) '([^']*)'$/.exec(c.trim())
    if (!m) throw new Error(`unhandled condition ${c}`)
    const value = outputs()[m[1] as string] ?? ''
    return m[2] === '!=' ? value !== m[3] : value === m[3]
  }

  const steps = Object.values(workflow().jobs)[0]?.steps ?? []
  const ran: string[] = []
  let exit = 0
  for (const step of steps) {
    // Hosted setup — checkout (simulated above), setup-bun, install.
    if (step.uses || !step.run || /bun install/.test(step.run)) continue
    // A failed step stops the job, as on the runner (no `if: always()` here).
    if (exit !== 0) break
    if (step.if !== undefined && !condition(step.if)) continue
    ran.push(step.name ?? step.run)
    const stepEnv: Record<string, string> = {
      ...env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_OUTPUT: output,
      GH_LOG: join(dir, '.gh-args'),
      GH_BODY: join(dir, '.gh-body'),
    }
    for (const [k, v] of Object.entries(step.env ?? {})) stepEnv[k] = expr(v)
    const r = spawnSync('bash', ['-e', '-c', expr(step.run)], { cwd: dir, env: stepEnv, encoding: 'utf8' })
    exit = r.status ?? 1
  }
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : undefined)
  return { code: outputs().code, ran, exit, ghArgs: read('.gh-args'), commentBody: read('.gh-body') }
}

describe('the docs GitHub Action', () => {
  it('is triggered by the spec, and may write PR comments', () => {
    const w = workflow()
    expect(w.on.pull_request.paths).toEqual(['openapi.yaml'])
    expect(w.permissions['pull-requests']).toBe('write')
  })

  it('a breaking change: comments the Markdown report, then fails the job', () => {
    const r = runWorkflow(SPEC(['name', 'tag']), SPEC(['name']))
    expect(r.code).toBe('1')
    expect(r.ran).toEqual(['Diff the contract', 'Comment', 'Fail on a breaking change'])
    expect(r.exit).toBe(1)
    expect(r.ghArgs).toBe('pr comment 42 --body-file contract.md --edit-last --create-if-none ')
    expect(r.commentBody).toContain('### API contract: 1 breaking, 0 additive')
    expect(r.commentBody).toContain('| `field-now-optional` | `Pet.tag` | required → optional | `getPet`, `useGetPet` (pets) |')
  }, 60_000)

  it('an additive change: comments and passes', () => {
    const r = runWorkflow(SPEC(['name']), SPEC(['name']).replace('"tag":', '"age":{"type":"integer"},"tag":'))
    expect(r.code).toBe('0')
    expect(r.ran).toEqual(['Diff the contract', 'Comment'])
    expect(r.exit).toBe(0)
    expect(r.commentBody).toContain('0 breaking, 1 additive')
  }, 60_000)

  it('no contract change: comments that nothing moved, and passes', () => {
    const r = runWorkflow(SPEC(['name']), SPEC(['name']))
    expect(r.code).toBe('0')
    expect(r.exit).toBe(0)
    expect(r.commentBody).toContain('Nothing a generated client depends on moved.')
  }, 60_000)

  it('an unreadable input (exit 2): no empty comment, and the job fails with 2', () => {
    const r = runWorkflow(SPEC(['name']), null)
    expect(r.code).toBe('2')
    expect(r.ran).toEqual(['Diff the contract', 'Fail on a breaking change'])
    expect(r.ghArgs).toBeUndefined()
    expect(r.exit).toBe(2)
  }, 60_000)
})
