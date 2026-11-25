import { describe, expect, it } from 'vitest'
import {
  type Cell,
  cellOf,
  expandSchedule,
  extractClusters,
  finalVerdict,
  foreignProcesses,
  hashFiles,
  identicalArms,
  type JobsFile,
  type LoadSample,
  lockPid,
  type LockFs,
  observedQuantum,
  parsePs,
  pastDeadline,
  quietSince,
  releaseLock,
  ALLOWED_PROGRAMS,
  allowedProgram,
  quoteArgv,
  renderArgv,
  resolveInside,
  requiredGapMs,
  resolveDeadline,
  runInvalidReasons,
  runVerdict,
  tryAcquireLock,
  validateJobsFile,
} from '../../../../../scripts/bench/ab/lib'

/**
 * The pure rules of `scripts/bench/ab/run.ts` / `analyze.ts`, which replaced the
 * per-session bash queues. Each `describe` locks one of the defects those
 * queues had. Nothing here spawns a process, boots a browser or times anything.
 */

// ─── Deadline ────────────────────────────────────────────────────────────────

describe('resolveDeadline', () => {
  const at = (y: number, mo: number, d: number, h: number, mi: number) =>
    new Date(y, mo - 1, d, h, mi, 0, 0)

  it('a run started at 01:13 with a 14:30 cut-off stops at 14:30 the same day', () => {
    // The string compare `"01:13" > "14:30"` is false at every minute until
    // 14:30, but the ad-hoc HHMM-integer variant broke on the other side of
    // midnight; an absolute timestamp is right in both directions.
    expect(resolveDeadline('14:30', at(2026, 11, 25, 1, 13))).toBe(
      at(2026, 11, 25, 14, 30).getTime(),
    )
  })

  it('a queue started before midnight stops at the cut-off the NEXT morning', () => {
    expect(resolveDeadline('07:30', at(2026, 11, 25, 23, 50))).toBe(
      at(2026, 11, 26, 7, 30).getTime(),
    )
    // Exactly at the cut-off means the next one, not "already past".
    expect(resolveDeadline('07:30', at(2026, 11, 25, 7, 30))).toBe(
      at(2026, 11, 26, 7, 30).getTime(),
    )
  })

  it('handles month and year rollover', () => {
    expect(resolveDeadline('00:05', at(2026, 12, 31, 23, 59))).toBe(at(2027, 1, 1, 0, 5).getTime())
  })

  it('accepts relative and absolute specs', () => {
    const now = at(2026, 11, 25, 22, 0)
    expect(resolveDeadline('+2h30m', now) - now.getTime()).toBe(9_000_000)
    expect(resolveDeadline('+90m', now) - now.getTime()).toBe(5_400_000)
    expect(resolveDeadline('+45s', now) - now.getTime()).toBe(45_000)
    expect(resolveDeadline('2026-11-26T07:30:00Z', now)).toBe(Date.UTC(2026, 10, 26, 7, 30))
  })

  it('rejects nonsense instead of running without a deadline', () => {
    for (const bad of ['1430', '25:00', '7:61', '+', 'tomorrow', '']) {
      expect(() => resolveDeadline(bad, new Date())).toThrow(/deadline|time of day/)
    }
  })

  it('pastDeadline compares timestamps across midnight', () => {
    const d = at(2026, 11, 26, 7, 30).getTime()
    expect(pastDeadline(d, at(2026, 11, 25, 23, 59).getTime())).toBe(false)
    expect(pastDeadline(d, at(2026, 11, 26, 0, 1).getTime())).toBe(false)
    expect(pastDeadline(d, d)).toBe(true)
    expect(pastDeadline(null, d)).toBe(false)
  })
})

// ─── Lock ────────────────────────────────────────────────────────────────────

/** In-memory file system with inode identities and O_EXCL semantics. */
function memFs(): LockFs & { files: Map<string, { content: string; ino: number }> } {
  const files = new Map<string, { content: string; ino: number }>()
  let ino = 1
  const eexist = () => Object.assign(new Error('EEXIST'), { code: 'EEXIST' })

  return {
    files,
    createExclusive(path, content) {
      if (files.has(path)) throw eexist()
      files.set(path, { content, ino: ino++ })
    },
    read: (p) => files.get(p)?.content ?? null,
    identity: (p) => (files.has(p) ? String(files.get(p)!.ino) : null),
    rename(from, to) {
      const f = files.get(from)
      if (!f) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      files.delete(from)
      files.set(to, f)
    },
    link(from, to) {
      if (files.has(to)) throw eexist()
      files.set(to, files.get(from)!)
    },
    unlink: (p) => void files.delete(p),
  }
}

describe('cross-session lock', () => {
  const L = '/x/BENCH_RUNNING'
  const alive = (pids: number[]) => (pid: number) => pids.includes(pid)

  it('reads the pid from every lock format on this machine', () => {
    expect(lockPid('ab 56227')).toBe(56227)
    expect(lockPid('txt 56227\n')).toBe(56227)
    expect(lockPid('bench-ab:x 42\n{"pid":42}')).toBe(42)
    expect(lockPid('')).toBeNull()
    expect(lockPid('held by someone')).toBeNull()
    expect(lockPid('x 0')).toBeNull()
  })

  it('creates atomically and refuses a lock held by a live pid — never reclaims it', () => {
    const fs = memFs()
    fs.files.set(L, { content: 'rc-opt 100\n', ino: 99 })
    const r = tryAcquireLock(fs, L, 'me 200\n', alive([100]), 't')
    expect(r).toEqual({ acquired: false, holder: 'rc-opt 100\n', reason: 'held' })
    expect(fs.read(L)).toBe('rc-opt 100\n')
  })

  it('never reclaims a lock whose pid it cannot read', () => {
    const fs = memFs()
    fs.files.set(L, { content: 'garbage', ino: 99 })
    const r = tryAcquireLock(fs, L, 'me 200\n', () => false, 't')
    expect(r).toMatchObject({ acquired: false, reason: 'held-unknown-pid' })
    expect(fs.read(L)).toBe('garbage')
  })

  it('reclaims a lock whose pid is dead', () => {
    const fs = memFs()
    fs.files.set(L, { content: 'ab 100\n', ino: 99 })
    const r = tryAcquireLock(fs, L, 'me 200\n', alive([]), 't')
    expect(r).toEqual({ acquired: true, reclaimed: { content: 'ab 100\n' } })
    expect(fs.read(L)).toBe('me 200\n')
    expect([...fs.files.keys()]).toEqual([L])
  })

  it('takes a free lock directly', () => {
    const fs = memFs()
    expect(tryAcquireLock(fs, L, 'me 200\n', alive([]), 't')).toEqual({
      acquired: true,
      reclaimed: null,
    })
  })

  it('a second reclaimer of the same stale lock leaves the first one’s fresh lock alone', () => {
    const fs = memFs()
    fs.files.set(L, { content: 'ab 100\n', ino: 99 })
    // Reclaimer B inspected the stale lock (ino 99) …
    const realIdentity = fs.identity
    let raced = false
    fs.identity = (p) => {
      const id = realIdentity(p)
      if (!raced && p === L) {
        raced = true
        // … and before it renames, A reclaims and writes its fresh lock.
        expect(
          tryAcquireLock({ ...fs, identity: realIdentity }, L, 'A 300\n', alive([300]), 'a'),
        ).toMatchObject({ acquired: true })
      }

      return id
    }
    const r = tryAcquireLock(fs, L, 'B 400\n', alive([300, 400]), 'b')
    expect(r).toMatchObject({ acquired: false, reason: 'held' })
    expect(fs.read(L)).toBe('A 300\n')
    expect([...fs.files.keys()]).toEqual([L])
  })

  it('releases only its own lock', () => {
    const fs = memFs()
    fs.files.set(L, { content: 'other 1\n', ino: 1 })
    expect(releaseLock(fs, L, 'me 200\n')).toBe(false)
    expect(fs.read(L)).toBe('other 1\n')
    fs.files.set(L, { content: 'me 200\n', ino: 2 })
    expect(releaseLock(fs, L, 'me 200\n')).toBe(true)
    expect(fs.read(L)).toBeNull()
  })
})

// ─── Validity ────────────────────────────────────────────────────────────────

const trace = (t0: number, t1: number, every: number, load = 2): LoadSample[] => {
  const out: LoadSample[] = []
  for (let t = t0; t < t1; t += every) out.push({ t, load1: load })
  out.push({ t: t1, load1: load })

  return out
}

const base = {
  startedAt: 0,
  endedAt: 10_000,
  exitCode: 0,
  maxLoad: 4,
  foreign: [] as string[],
  expectedEntryHash: 'h1',
  entryHashAfter: 'h1',
}

describe('run validity', () => {
  it('a dense, quiet, clean run is VALID', () => {
    expect(runInvalidReasons({ ...base, samples: trace(0, 10_000, 1000) })).toEqual([])
  })

  it('the ad-hoc queues’ ~2 samples per 10 s job are INVALID', () => {
    const r = runInvalidReasons({
      ...base,
      samples: [
        { t: 0, load1: 1 },
        { t: 5000, load1: 1 },
        { t: 10_000, load1: 1 },
      ],
    })
    expect(r.join()).toMatch(/load-sample-gap-5000ms>2500ms/)
  })

  it('requires a sample at both ends and an interval of duration / 5, never below 1 s', () => {
    expect(requiredGapMs(3000)).toBe(1000)
    expect(requiredGapMs(60_000)).toBe(12_000)
    expect(runInvalidReasons({ ...base, samples: trace(2000, 10_000, 1000) })).toContain(
      'no-load-sample-at-start',
    )
    expect(runInvalidReasons({ ...base, samples: trace(0, 8000, 1000) })).toContain(
      'no-load-sample-at-end',
    )
    expect(runInvalidReasons({ ...base, samples: [{ t: 0, load1: 1 }] })).toContain(
      'load-trace-too-short',
    )
  })

  it('one sample at or above the threshold invalidates the run', () => {
    const s = trace(0, 10_000, 1000)
    s[4] = { t: s[4]!.t, load1: 4 }
    expect(runInvalidReasons({ ...base, samples: s })).toEqual(['load1-peak-4.00>=4'])
  })

  it('a non-zero exit, a foreign bench or a changed / missing build entry invalidates it', () => {
    const samples = trace(0, 10_000, 1000)
    expect(runInvalidReasons({ ...base, samples, exitCode: 1 })).toEqual(['exit-1'])
    expect(runInvalidReasons({ ...base, samples, exitCode: null })).toEqual(['exit-signal'])
    expect(
      runInvalidReasons({
        ...base,
        samples,
        foreign: ['9 bun bench-fair.ts', '9 bun bench-fair.ts'],
      }),
    ).toEqual(['foreign-bench:9 bun bench-fair.ts'])
    expect(runInvalidReasons({ ...base, samples, entryHashAfter: 'h2' })).toEqual([
      'entry-changed:h1->h2',
    ])
    expect(runInvalidReasons({ ...base, samples, entryHashAfter: null })).toEqual([
      'entry-missing-after-run',
    ])
  })

  it('quietSince restarts the stretch at every loud sample', () => {
    const s = [
      { t: 0, load1: 1 },
      { t: 1, load1: 5 },
      { t: 2, load1: 1 },
      { t: 3, load1: 2 },
    ]
    expect(quietSince(s, 4)).toBe(2)
    expect(quietSince([...s, { t: 4, load1: 4 }], 4)).toBeNull()
    expect(quietSince([], 4)).toBeNull()
  })
})

describe('foreign processes', () => {
  const ps = parsePs(
    [
      '  1     0 /sbin/launchd',
      ' 10     1 /bin/bash -c bun scripts/bench/ab/run.ts jobs.json',
      ' 11    10 bun scripts/bench/ab/run.ts jobs.json',
      ' 12    11 /bin/bash -c bun bench-scenarios.ts --scenario tree',
      ' 13    12 bun bench-scenarios.ts --scenario tree',
      ' 20     1 bun bench-fair.ts --repeat 1',
      ' 21     1 bun scripts/bench/ab/run.ts other.json',
      ' 22     1 bunx vitest run',
      ' 23     1 ps -axo pid=,ppid=,command=',
    ].join('\n'),
  )

  it('parses ps output', () => {
    expect(ps).toHaveLength(9)
    expect(ps[3]).toEqual({
      pid: 12,
      ppid: 11,
      command: '/bin/bash -c bun bench-scenarios.ts --scenario tree',
    })
  })

  it('a foreign bench is a matching process outside this runner’s tree (ancestors and descendants excluded)', () => {
    expect(
      foreignProcesses(ps, 11, [
        /bench-fair\.ts/,
        /bench-scenarios\.ts/,
        /scripts\/bench\/ab\/run\.ts/,
      ]),
    ).toEqual(['20 bun bench-fair.ts --repeat 1', '21 bun scripts/bench/ab/run.ts other.json'])
  })

  it('builds and test suites are not foreign benches (the load rule covers them)', () => {
    expect(foreignProcesses(ps, 11, [/vitest/]).length).toBe(1)
    expect(foreignProcesses(ps, 11, [/bench-fair\.ts/])).not.toContain('22 bunx vitest run')
  })

  it('extra markers from the command line are literal substrings, never regular expressions', () => {
    // A user-supplied `(a+)+$`-style pattern would be ReDoS-able and `.` would
    // match anything; as a substring it only matches itself.
    expect(foreignProcesses(ps, 11, [], ['.*'])).toEqual([])
    expect(foreignProcesses(ps, 11, [], ['(a+)+$'])).toEqual([])
    expect(foreignProcesses(ps, 11, [], ['bench-fair.ts --repeat'])).toEqual([
      '20 bun bench-fair.ts --repeat 1',
    ])
  })
})

// ─── Schedule, arm identity, jobs file ───────────────────────────────────────

const JOBS: JobsFile = {
  name: 'ab-test',
  arms: {
    A: { dir: '/tmp/a', entry: ['examples/benchmark/dist/assets/index-*.js'] },
    B: { dir: '/tmp/b', entry: ['examples/benchmark/dist/assets/index-*.js'] },
  },
  jobs: [
    {
      label: 'tree',
      cwd: 'examples/benchmark',
      argv: [
        'bun',
        'bench-scenarios.ts',
        '--only',
        'Pyreon,SolidJS',
        '--pass-offset',
        '{pass}',
        '--raw-out',
        '{out}',
      ],
    },
  ],
  runs: 2,
  passes: 2,
}

describe('schedule and arm identity', () => {
  it('interleaves strictly and rotates the arm order every pass', () => {
    expect(expandSchedule(JOBS).map((s) => s.id)).toEqual([
      'tree-A-r1-p1',
      'tree-B-r1-p1',
      'tree-B-r1-p2',
      'tree-A-r1-p2',
      'tree-A-r2-p3',
      'tree-B-r2-p3',
      'tree-B-r2-p4',
      'tree-A-r2-p4',
    ])
  })

  it('renders placeholders inside each argument, never re-splitting a value', () => {
    const v = { out: '/tmp/o $(touch x); rm -rf ~.json', pass: 3, run: 2, arm: 'B' }
    expect(
      renderArgv(
        ['bun', 'x.ts', '--pass-offset', '{pass}', '--raw-out', '{out}', '{arm}-r{run}'],
        v,
      ),
    ).toEqual([
      'bun',
      'x.ts',
      '--pass-offset',
      '3',
      '--raw-out',
      '/tmp/o $(touch x); rm -rf ~.json',
      'B-r2',
    ])
    // The log rendering quotes it, so a copy-pasted command is still one argument.
    expect(quoteArgv(['bun', "it's", '/a b'])).toBe("bun 'it'\\''s' '/a b'")
  })

  it('runs only allow-listed programs, without a shell', () => {
    expect(ALLOWED_PROGRAMS).toEqual(['bun', 'bunx', 'node'])
    expect(allowedProgram('bun')).toBe('bun')
    for (const bad of ['/bin/bash', 'sh', 'bun; rm -rf /', '../bun', '', undefined]) {
      expect(allowedProgram(bad)).toBeNull()
    }
  })

  it('keeps working directories inside the arm dir', () => {
    expect(resolveInside('/tmp/wt', 'examples/benchmark')).toBe('/tmp/wt/examples/benchmark')
    expect(resolveInside('/tmp/wt', undefined)).toBe('/tmp/wt')
    expect(resolveInside('/tmp/wt', '../other')).toBeNull()
    expect(resolveInside('/tmp/wt', 'a/../../x')).toBeNull()
    expect(resolveInside('/tmp/wt', '/etc')).toBeNull()
    expect(resolveInside('/tmp/wt', '../wt2')).toBeNull()
  })

  it('hashes content, not names, and flags arms that are the same build', () => {
    const a = hashFiles([{ path: 'index-abc.js', content: 'one' }])
    expect(hashFiles([{ path: 'index-abc.js', content: 'two' }])).not.toBe(a)
    expect(
      hashFiles([
        { path: 'x', content: '1' },
        { path: 'y', content: '2' },
      ]),
    ).toBe(
      hashFiles([
        { path: 'y', content: '2' },
        { path: 'x', content: '1' },
      ]),
    )
    expect(identicalArms({ A: 'h1', B: 'h1', C: 'h2' })).toEqual([['A', 'B']])
    expect(identicalArms({ A: 'h1', B: 'h2' })).toEqual([])
  })

  it('validates the jobs file', () => {
    expect(validateJobsFile(JOBS)).toEqual([])
    expect(validateJobsFile(null)).toEqual(['jobs file must be a JSON object'])
    const bad = validateJobsFile({
      name: 'a b',
      arms: { A: { dir: 'rel', entry: [] }, 'B/': { dir: '/b', entry: ['x'], build: {} } },
      jobs: [
        { label: 'j', argv: ['bun', 'no-output.ts'] },
        { label: 'j', argv: ['/bin/bash', '-c', 'x > {out}'] },
        { label: 'k', argv: 'bun x.ts {out}', cwd: '../escape' },
      ],
      runs: 0,
    })
    expect(bad).toEqual([
      '"name" must match [A-Za-z0-9._-]+',
      'arm "A": "dir" must be an absolute path',
      'arm "A": "entry" needs at least one glob',
      'arm id "B/" must match [A-Za-z0-9._-]+',
      'arm "B/" build: "argv" must be a non-empty array of strings',
      'job "j": "argv" must write its result to {out}',
      'duplicate job label "j"',
      'job "j": argv[0] must be one of bun, bunx, node (got "/bin/bash")',
      'job "k": "argv" must be a non-empty array of strings',
      'job "k": "cwd" must be a relative path inside the arm dir',
      '"runs" must be a positive integer',
    ])
    expect(validateJobsFile({ name: 'x', arms: {}, jobs: [] })).toEqual([
      '"arms" needs at least two arms',
      '"jobs" needs at least one job',
    ])
  })
})

// ─── Analysis and the verdict rule ───────────────────────────────────────────

const cell = (median: number, lo: number, hi: number, quanta = 100): Cell => ({
  median,
  ci: [lo, hi],
  cv: 0.01,
  n: 100,
  clusters: 5,
  quanta,
})

describe('verdict rule', () => {
  it('WIN / LOSS only when the CIs are disjoint in the same direction in both runs', () => {
    expect(
      finalVerdict([
        { a: cell(10, 9.8, 10.2), b: cell(9, 8.8, 9.2) },
        { a: cell(10, 9.8, 10.2), b: cell(9, 8.9, 9.1) },
      ]).verdict,
    ).toBe('WIN')
    expect(
      finalVerdict([
        { a: cell(10, 9.8, 10.2), b: cell(11, 10.8, 11.2) },
        { a: cell(10, 9.8, 10.2), b: cell(11, 10.5, 11.5) },
      ]).verdict,
    ).toBe('LOSS')
  })

  it('disjoint in one run and overlapping in the other is a TIE, as is a split direction', () => {
    const one = finalVerdict([
      { a: cell(10, 9.8, 10.2), b: cell(9, 8.8, 9.2) },
      { a: cell(10, 9.5, 10.5), b: cell(9.6, 9.2, 9.9) },
    ])
    expect(one).toEqual({ verdict: 'TIE', why: 'split: B faster / tie' })
    const split = finalVerdict([
      { a: cell(10, 9.8, 10.2), b: cell(9, 8.8, 9.2) },
      { a: cell(10, 9.8, 10.2), b: cell(11, 10.8, 11.2) },
    ])
    expect(split.verdict).toBe('TIE')
    expect(
      finalVerdict([
        { a: cell(10, 9, 11), b: cell(10, 9, 11) },
        { a: cell(10, 9, 11), b: cell(10, 9, 11) },
      ]).why,
    ).toBe('CIs overlap in every run')
  })

  it('under 10 clock quanta, or with one run, there is no verdict', () => {
    expect(
      finalVerdict([
        { a: cell(10, 9.8, 10.2, 9), b: cell(9, 8.8, 9.2) },
        { a: cell(10, 9.8, 10.2), b: cell(9, 8.8, 9.2) },
      ]).verdict,
    ).toBe('NO VERDICT')
    expect(finalVerdict([{ a: cell(10, 9.8, 10.2), b: cell(9, 8.8, 9.2) }]).verdict).toBe(
      'NO VERDICT',
    )
  })

  it('runVerdict reads B against A', () => {
    expect(runVerdict(cell(10, 9, 11), cell(5, 4, 6))).toBe('B faster')
    expect(runVerdict(cell(10, 9, 11), cell(15, 12, 16))).toBe('B slower')
    expect(runVerdict(cell(10, 9, 11), cell(10.5, 10.9, 12))).toBe('tie')
  })
})

describe('analysis inputs', () => {
  it('counts clock quanta from the observed sample resolution', () => {
    // 5 µs isolated clock: samples on a 0.005 ms grid.
    const perOp = [0.04, 0.045, 0.05, 0.045, 0.04]
    expect(observedQuantum(perOp)).toBeCloseTo(0.005, 9)
    expect(cellOf([perOp], false).quanta).toBeCloseTo(9, 6)
    expect(observedQuantum([1, 1, 1])).toBe(Number.POSITIVE_INFINITY)
    expect(cellOf([[1, 1, 1]], false).quanta).toBe(0)
    expect(cellOf([[100, 101]], true).quanta).toBe(Number.POSITIVE_INFINITY)
  })

  it('reads all three harness formats into per-row clusters', () => {
    const scen = extractClusters({ clusters: [['tree\u0000mount\u0000Pyreon', [[1, 2], [3]]]] })
    expect(scen).toEqual({
      rows: new Map([['tree · mount · Pyreon', [[1, 2], [3]]]]),
      windowAveraged: false,
    })
    const fair = extractClusters({
      suites: [
        { framework: 'Pyreon', results: [{ name: 'clear', samples: [1, 2, 3, 4], pages: 2 }] },
      ],
    })
    expect(fair.rows.get('clear · Pyreon')).toEqual([
      [1, 2],
      [3, 4],
    ])
    const micro = extractClusters({
      sections: { crw: [{ lib: 'pyreonFolded', processes: [[5, 6], [7]] }] },
    })
    expect(micro).toEqual({
      rows: new Map([['crw · pyreonFolded', [[5, 6], [7]]]]),
      windowAveraged: true,
    })
    expect(() => extractClusters({ sections: { crw: [{ lib: 'x' }] } })).toThrow(
      /per-process samples/,
    )
    expect(() =>
      extractClusters({
        suites: [{ framework: 'P', results: [{ name: 'x', samples: [1, 2, 3], pages: 2 }] }],
      }),
    ).toThrow(/split/)
    expect(() => extractClusters({})).toThrow(/unrecognised/)
  })
})
