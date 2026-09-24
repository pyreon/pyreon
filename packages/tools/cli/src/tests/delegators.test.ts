/**
 * The five npx-delegating commands, as a FAMILY.
 *
 * `pyreon new` / `atlas` / `loom` / `mcp` / `lathe` are all the same shape:
 * build an `npx` argv, spawn it with inherited stdio, forward the exit code.
 * Each has (or, for `lathe`, had) its own small test covering `--dry-run` and
 * the argv — so every one of them sat at ~50%, with the half that actually
 * RUNS untested, and `lathe.ts` at 0% with no test file at all.
 *
 * Three contracts live in that untested half, and each fails silently:
 *
 *   * **The exit code is forwarded.** `pyreon lathe check` and
 *     `pyreon atlas verify --check` are CI gates. A delegator that swallowed
 *     the child's status and returned 0 would make every pipeline using them
 *     green regardless of the result — the same class as a `check` command
 *     that exits 0 on a failure.
 *   * **stdio is INHERITED.** `pyreon mcp` speaks JSON-RPC over stdin/stdout
 *     to the AI client that spawned it; piping would sever the protocol
 *     rather than fail, so the server would appear to start and answer
 *     nothing. The others stream progress reports through it.
 *   * **`--yes` is always passed.** Without it `npx` prompts before
 *     installing a package that is not present, and a CI run hangs until it
 *     is killed — a timeout, not an error message.
 *
 * The `@latest` split is asserted across the whole family in one table
 * because that is where it is at risk: the commands are near-identical, so a
 * sixth is written by copying a fifth, and copying the wrong one silently
 * inverts a deliberate decision. `new` pins `@latest` so a scaffold starts on
 * current templates however old the installed CLI is; the other four
 * deliberately do NOT, so the tool that runs is the one pinned alongside the
 * project it is run against.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileSync = vi.fn()
vi.mock('node:child_process', () => ({ execFileSync: (...a: unknown[]) => execFileSync(...a) }))

const { buildAtlasArgs, runAtlas } = await import('../atlas')
const { buildLatheArgs, runLathe } = await import('../lathe')
const { buildLoomArgs, runLoom } = await import('../loom')
const { buildMcpArgs, runMcp } = await import('../mcp')
const { buildScaffolderArgs, runNew } = await import('../new')

let logs: string[]

beforeEach(() => {
  logs = []
  execFileSync.mockReset()
  execFileSync.mockReturnValue(Buffer.from(''))
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')))
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Every delegator, with the package spec it must produce. */
const FAMILY = [
  { name: 'atlas', build: () => buildAtlasArgs([]), run: runAtlas, pkg: '@pyreon/atlas', latest: false },
  { name: 'lathe', build: () => buildLatheArgs([]), run: runLathe, pkg: '@pyreon/lathe', latest: false },
  { name: 'loom', build: () => buildLoomArgs([]), run: runLoom, pkg: '@pyreon/loom', latest: false },
  { name: 'mcp', build: () => buildMcpArgs([]), run: runMcp, pkg: '@pyreon/mcp', latest: false },
  {
    name: 'new',
    build: () => buildScaffolderArgs({ native: false, args: [] }),
    run: (o: { args: string[]; dryRun: boolean }) => runNew({ ...o, native: false }),
    pkg: '@pyreon/create-zero',
    latest: true,
  },
] as const

describe('the @latest split is deliberate, per command', () => {
  for (const { name, build, pkg, latest } of FAMILY) {
    it(`${name} → ${pkg}${latest ? '@latest' : ' (project-local)'}`, () => {
      const spec = build().find((a) => a.startsWith('@pyreon/'))
      expect(spec, `${name} must delegate to ${pkg}`).toBe(latest ? `${pkg}@latest` : pkg)
    })
  }

  it('exactly ONE of the five pins @latest', () => {
    // The table above is only a guard if the split is asserted as a whole:
    // a sixth delegator copied from the wrong sibling inverts the decision,
    // and a per-command spec would pass while the family drifted.
    const pinned = FAMILY.filter(({ build }) =>
      build().some((a) => a.endsWith('@latest')),
    ).map((f) => f.name)
    expect(pinned, 'only `new` starts a project, so only `new` wants latest').toEqual(['new'])
  })

  it('every delegator passes --yes, so npx never prompts', () => {
    // Without it, npx asks before installing a package that is not present
    // and a CI run hangs until it is killed — a timeout with no message.
    for (const { name, build } of FAMILY) {
      expect(build()[0], `${name} must pass --yes first`).toBe('--yes')
    }
  })

  it('the package spec comes BEFORE any passthrough arg', () => {
    // `npx --yes <pkg> <args>`. A spec after an arg makes npx treat the arg
    // as the package name and install something else entirely.
    expect(buildLatheArgs(['generate', './openapi.yaml'])).toEqual([
      '--yes',
      '@pyreon/lathe',
      'generate',
      './openapi.yaml',
    ])
  })
})

describe('passthrough is verbatim', () => {
  it('forwards args in order, including flags that look like ours', () => {
    // `--json` and `--check` are flags the CLI itself understands elsewhere;
    // a delegator that consumed them would silently change the child's
    // behaviour.
    expect(buildAtlasArgs(['verify', 'Button', '--json', '--check'])).toEqual([
      '--yes',
      '@pyreon/atlas',
      'verify',
      'Button',
      '--json',
      '--check',
    ])
  })

  it('an empty arg list still produces a runnable command', () => {
    for (const { name, build, pkg } of FAMILY) {
      expect(build(), name).toEqual(['--yes', pkg === '@pyreon/create-zero' ? `${pkg}@latest` : pkg])
    }
  })
})

describe('running spawns npx with inherited stdio', () => {
  for (const { name, run, pkg, latest } of FAMILY) {
    it(`${name} spawns npx and inherits stdio`, () => {
      const code = run({ args: ['sub'], dryRun: false })

      expect(code).toBe(0)
      expect(execFileSync).toHaveBeenCalledOnce()
      const [cmd, args, opts] = execFileSync.mock.calls[0] as [string, string[], { stdio: string }]
      expect(cmd).toBe('npx')
      expect(args).toEqual(['--yes', latest ? `${pkg}@latest` : pkg, 'sub'])
      expect(opts.stdio, `${name} must inherit — piping severs MCP's protocol`).toBe('inherit')
    })
  }
})

describe('the child exit code reaches the caller', () => {
  for (const { name, run } of FAMILY) {
    it(`${name} forwards a non-zero status`, () => {
      // These are CI gates. Returning 0 for a failed run makes every
      // pipeline using them green regardless of the result.
      execFileSync.mockImplementation(() => {
        throw Object.assign(new Error('child failed'), { status: 2 })
      })
      expect(run({ args: [], dryRun: false }), `${name} must not swallow 2`).toBe(2)
    })
  }

  it('a thrown error with NO numeric status becomes 1, never 0', () => {
    // `npx` missing from PATH throws an ENOENT with no status. Reporting
    // success there is worse than reporting a generic failure.
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' })
    })
    expect(runLathe({ args: [], dryRun: false })).toBe(1)
  })

  it('a non-numeric status is not passed through as-is', () => {
    // A signal-killed child can carry `status: null`; returning it would
    // make the process exit 0.
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error('killed'), { status: null })
    })
    expect(runMcp({ args: [], dryRun: false })).toBe(1)
  })
})

describe('--dry-run prints the command and spawns nothing', () => {
  for (const { name, run, pkg, latest } of FAMILY) {
    it(`${name} prints a copy-pasteable npx line`, () => {
      const code = run({ args: ['x'], dryRun: true })

      expect(code).toBe(0)
      expect(execFileSync, `${name} must not spawn on a dry run`).not.toHaveBeenCalled()
      expect(logs.join('\n')).toBe(`npx --yes ${latest ? `${pkg}@latest` : pkg} x`)
    })
  }
})
