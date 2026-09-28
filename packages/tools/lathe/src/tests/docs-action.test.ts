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
 * package's SOURCE entry, and `gh` is a stub backed by a directory of
 * comments (one file per comment id). What cannot run here is the hosted part:
 * checkout, setup-bun, `bun install`, the real GitHub API and the real `jq`
 * filter — `.github/workflows/lathe-action-selftest.yml` runs the SAME step
 * scripts on a hosted runner against a real pull request, and the last spec
 * here holds the two copies identical.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  /** Every `gh` invocation, one per line. */
  ghLog: string
  /** The PR's comments after the job, by id. */
  comments: Record<string, string>
  summary: string
  stdout: string
}

const MARKER = '<!-- lathe-contract -->'

interface RunOptions {
  /** Comments already on the PR, by id. */
  comments?: Record<string, string>
  /** The PR comes from a fork — its token is read-only. */
  fork?: boolean
  /** Every `gh` call fails, as during a GitHub API outage. */
  ghDown?: boolean
}

/** Run the workflow's shell steps for a PR whose spec is `head`, against a `main` holding `base`. */
function runWorkflow(base: string, head: string | null, opts: RunOptions = {}): Run {
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
  // The stub `gh` answers the calls the Comment step makes: list the
  // PR's comments (returning the ids whose body starts with the marker — the
  // step's `--jq` filter), PATCH one (`-F body=@file`), and `pr comment`.
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/bin/sh',
      'echo "$*" >> "$GH_LOG"',
      '[ -n "$GH_TOKEN" ] || exit 4',
      '[ -z "$GH_DOWN" ] || exit 1',
      'if [ "$1" = api ] && [ "$2" = -X ]; then',
      '  id=${4##*/}',
      '  for a; do case $a in body=@*) cp "${a#body=@}" "$GH_COMMENTS/$id";; esac; done',
      '  exit 0',
      'fi',
      'if [ "$1" = api ]; then',
      `  for f in $(ls "$GH_COMMENTS" | sort -n); do head -n 1 "$GH_COMMENTS/$f" | grep -qxF ${JSON.stringify(MARKER)} && echo "$f"; done`,
      '  exit 0',
      'fi',
      'if [ "$1" = pr ] && [ "$2" = comment ]; then',
      '  id=$((1000 + $(ls "$GH_COMMENTS" | wc -l)))',
      // `--edit-last` edits the token's most recent comment, whoever's job wrote it.
      '  case " $* " in *" --edit-last "*) last=$(ls "$GH_COMMENTS" | sort -n | tail -n 1); [ -n "$last" ] && id=$last;; esac',
      '  while [ $# -gt 0 ]; do [ "$1" = --body-file ] && cp "$2" "$GH_COMMENTS/$id"; shift; done',
      '  exit 0',
      'fi',
      'exit 5',
      '',
    ].join('\n'),
  )
  // The retry back-off, without the wait.
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\necho "sleep $1" >> "$GH_LOG"\n')
  chmodSync(join(bin, 'bunx'), 0o755)
  chmodSync(join(bin, 'gh'), 0o755)
  chmodSync(join(bin, 'sleep'), 0o755)
  const commentsDir = join(dir, '.comments')
  mkdirSync(commentsDir)
  for (const [id, body] of Object.entries(opts.comments ?? {})) writeFileSync(join(commentsDir, id), body)
  const summaryFile = join(dir, '.summary')
  writeFileSync(summaryFile, '')

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
      if (e === 'github.repository') return 'acme/shop'
      if (e === 'github.event.pull_request.head.repo.full_name') return opts.fork ? 'someone/shop' : 'acme/shop'
      const out = /^steps\.diff\.outputs\.(\w+)$/.exec(e)
      if (out) return outputs()[out[1] as string] ?? ''
      throw new Error(`unhandled expression ${e}`)
    })
  /**
   * The condition shapes the workflow uses: `steps.diff.outputs.X op 'v'` and
   * `<github expr> == <github expr>`, joined by `&&`.
   */
  const condition = (c: string): boolean =>
    c.split('&&').every((clause) => {
      const m = /^(\S+) (!=|==) (\S+)$/.exec(clause.trim())
      if (!m) throw new Error(`unhandled condition ${c}`)
      const side = (x: string): string => {
        const lit = /^'([^']*)'$/.exec(x)
        if (lit) return lit[1] as string
        const out = /^steps\.diff\.outputs\.(\w+)$/.exec(x)
        if (out) return outputs()[out[1] as string] ?? ''
        return expr(`\${{ ${x} }}`)
      }
      const [l, r] = [side(m[1] as string), side(m[3] as string)]
      return m[2] === '!=' ? l !== r : l === r
    })

  const steps = Object.values(workflow().jobs)[0]?.steps ?? []
  const ran: string[] = []
  let exit = 0
  let stdout = ''
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
      GITHUB_REPOSITORY: 'acme/shop',
      GITHUB_STEP_SUMMARY: summaryFile,
      GH_LOG: join(dir, '.gh-log'),
      GH_COMMENTS: commentsDir,
      ...(opts.ghDown ? { GH_DOWN: '1' } : {}),
    }
    for (const [k, v] of Object.entries(step.env ?? {})) stepEnv[k] = expr(v)
    const r = spawnSync('bash', ['-e', '-c', expr(step.run)], { cwd: dir, env: stepEnv, encoding: 'utf8' })
    stdout += r.stdout
    exit = r.status ?? 1
  }
  const log = join(dir, '.gh-log')
  return {
    code: outputs().code,
    ran,
    exit,
    ghLog: existsSync(log) ? readFileSync(log, 'utf8') : '',
    comments: Object.fromEntries(readdirSync(commentsDir).map((id) => [id, readFileSync(join(commentsDir, id), 'utf8')])),
    summary: readFileSync(summaryFile, 'utf8'),
    stdout,
  }
}

const STEPS = ['Diff the contract', 'Summary', 'Comment']

describe('the docs GitHub Action', () => {
  it('is triggered by the spec, and may write PR comments', () => {
    const w = workflow()
    expect(w.on.pull_request.paths).toEqual(['openapi.yaml'])
    expect(w.permissions['pull-requests']).toBe('write')
  })

  it('a breaking change: comments the Markdown report, then fails the job', () => {
    const r = runWorkflow(SPEC(['name', 'tag']), SPEC(['name']))
    expect(r.code).toBe('1')
    expect(r.ran).toEqual([...STEPS, 'Fail on a breaking change'])
    expect(r.exit).toBe(1)
    const bodies = Object.values(r.comments)
    expect(bodies).toHaveLength(1)
    expect(bodies[0]?.startsWith(`${MARKER}\n### API contract: 1 breaking, 0 additive`)).toBe(true)
    expect(bodies[0]).toContain('| `field-now-optional` | `Pet.tag` | required → optional | `getPet`, `useGetPet` (pets) |')
    // The report is in the job summary as well — where a fork PR reads it.
    expect(r.summary).toContain('### API contract: 1 breaking, 0 additive')
  }, 60_000)

  it('an additive change: comments and passes', () => {
    const r = runWorkflow(SPEC(['name']), SPEC(['name']).replace('"tag":', '"age":{"type":"integer"},"tag":'))
    expect(r.code).toBe('0')
    expect(r.ran).toEqual(STEPS)
    expect(r.exit).toBe(0)
    expect(Object.values(r.comments)[0]).toContain('0 breaking, 1 additive')
  }, 60_000)

  it('no contract change: comments that nothing moved, and passes', () => {
    const r = runWorkflow(SPEC(['name']), SPEC(['name']))
    expect(r.code).toBe('0')
    expect(r.exit).toBe(0)
    expect(Object.values(r.comments)[0]).toContain('Nothing a generated client depends on moved.')
  }, 60_000)

  it('an unreadable input (exit 2): no empty comment, and the job fails with 2', () => {
    const r = runWorkflow(SPEC(['name']), null)
    expect(r.code).toBe('2')
    expect(r.ran).toEqual(['Diff the contract', 'Fail on a breaking change'])
    expect(r.ghLog).toBe('')
    expect(r.comments).toEqual({})
    expect(r.exit).toBe(2)
  }, 60_000)

  // `gh pr comment --edit-last` edits whichever comment the workflow token wrote
  // LAST — in a repository with any other bot comment (a bundle-size report,
  // a coverage table), that is the other job's comment, which it overwrote.
  it("updates its own comment on a re-run and never touches another bot's", () => {
    const other = '### Bundle size\n| pkg | delta |'
    const r = runWorkflow(SPEC(['name', 'tag']), SPEC(['name']), {
      comments: { '7': `${MARKER}\n### API contract: stale`, '9': other },
    })
    expect(Object.keys(r.comments).sort()).toEqual(['7', '9'])
    expect(r.comments['9']).toBe(other)
    expect(r.comments['7']).toContain('1 breaking, 0 additive')
    expect(r.ghLog).toContain('api -X PATCH repos/acme/shop/issues/comments/7 -F body=@comment.md')
    expect(r.ghLog).not.toContain('pr comment')
  }, 60_000)

  it('a fork PR (read-only token): no comment attempted, the report is in the summary', () => {
    const r = runWorkflow(SPEC(['name', 'tag']), SPEC(['name']), { fork: true })
    expect(r.ran).toEqual(['Diff the contract', 'Summary', 'Fail on a breaking change'])
    expect(r.ghLog).toBe('')
    expect(r.summary).toContain('1 breaking, 0 additive')
    expect(r.exit).toBe(1)
  }, 60_000)

  // The check reports the CONTRACT: a GitHub API outage while commenting is a
  // warning after three attempts, never a red check on a compatible change.
  it('a failing comment post is retried, then downgraded to a warning', () => {
    const r = runWorkflow(SPEC(['name']), SPEC(['name']), { ghDown: true })
    expect(r.exit).toBe(0)
    expect(r.ghLog.match(/^sleep /gm)).toHaveLength(3)
    expect(r.stdout).toContain('::warning::could not post the contract comment')
  }, 60_000)
})
