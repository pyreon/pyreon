import {
  analyzeReactiveTrace,
  buildErrorDossier,
  errorMessage,
  parseErrorReport,
  type TraceEntry,
} from '../explain-error'

describe('parseErrorReport', () => {
  it('parses a full ErrorContext-shaped report', () => {
    const r = parseErrorReport(
      JSON.stringify({
        error: { message: 'boom', name: 'TypeError', stack: 'a\nb' },
        phase: 'render',
        component: 'UserCard',
        props: { id: 1 },
        reactiveTrace: [{ name: 'user', prev: 'User {id}', next: 'null', timestamp: 1 }],
      }),
    )
    expect(r).not.toBeNull()
    expect(r!.component).toBe('UserCard')
    expect(r!.reactiveTrace).toHaveLength(1)
  })

  it('accepts a bare string error', () => {
    const r = parseErrorReport(JSON.stringify({ error: 'plain message' }))
    expect(r?.error).toBe('plain message')
  })

  it('returns null on invalid JSON', () => {
    expect(parseErrorReport('{not json')).toBeNull()
  })

  it('returns null when `error` is absent', () => {
    expect(parseErrorReport(JSON.stringify({ phase: 'render' }))).toBeNull()
  })

  it('drops malformed trace entries (missing prev/next) but keeps valid ones', () => {
    const r = parseErrorReport(
      JSON.stringify({
        error: 'x',
        reactiveTrace: [
          { name: 'a', prev: '0', next: '1', timestamp: 1 },
          { name: 'b', timestamp: 2 }, // malformed — no prev/next
          null,
        ],
      }),
    )
    expect(r!.reactiveTrace).toHaveLength(1)
    expect(r!.reactiveTrace![0]!.name).toBe('a')
  })

  it('errorMessage normalises object + string forms', () => {
    expect(errorMessage({ error: 'str' })).toBe('str')
    expect(errorMessage({ error: { message: 'm' } })).toBe('m')
    expect(errorMessage({ error: { name: 'TypeError' } })).toBe('TypeError')
  })
})

describe('analyzeReactiveTrace heuristics', () => {
  it('empty-trace → high confidence, points away from reactive bug', () => {
    const f = analyzeReactiveTrace([], 'TypeError: x is not a function')
    expect(f).toHaveLength(1)
    expect(f[0]!.code).toBe('empty-trace')
    expect(f[0]!.confidence).toBe('high')
  })

  it('empty-trace also fires for undefined trace', () => {
    expect(analyzeReactiveTrace(undefined, 'boom')[0]!.code).toBe('empty-trace')
  })

  it('last-write-correlation when last signal name is in the message', () => {
    const trace: TraceEntry[] = [
      { name: 'count', prev: '0', next: '1', timestamp: 1 },
      { name: 'user', prev: 'User {}', next: 'null', timestamp: 2 },
    ]
    const f = analyzeReactiveTrace(trace, "Cannot read properties of null (reading 'name') — user")
    expect(f.some((x) => x.code === 'last-write-correlation' && x.confidence === 'high')).toBe(true)
  })

  it('nullish-then-crash when a signal set to null appears in the message', () => {
    const trace: TraceEntry[] = [
      { name: 'session', prev: 'Session {token}', next: 'null', timestamp: 1 },
      { name: 'other', prev: '1', next: '2', timestamp: 2 },
    ]
    const f = analyzeReactiveTrace(trace, 'reading token of session')
    expect(f.some((x) => x.code === 'nullish-then-crash')).toBe(true)
  })

  it('write-storm high confidence at ≥2× threshold (16+ writes)', () => {
    const trace: TraceEntry[] = Array.from({ length: 18 }, (_, i) => ({
      name: 'tick',
      prev: String(i),
      next: String(i + 1),
      timestamp: i,
    }))
    const f = analyzeReactiveTrace(trace, 'Maximum update depth exceeded')
    const storm = f.find((x) => x.code === 'write-storm')
    expect(storm).toBeDefined()
    expect(storm!.confidence).toBe('high') // 18 ≥ 2× threshold(8) → high
  })

  it('write-storm medium confidence between 1x and 2x threshold', () => {
    const trace: TraceEntry[] = Array.from({ length: 9 }, (_, i) => ({
      name: 'n',
      prev: String(i),
      next: String(i + 1),
      timestamp: i,
    }))
    const storm = analyzeReactiveTrace(trace, 'x').find((x) => x.code === 'write-storm')
    expect(storm?.confidence).toBe('medium')
  })

  it('type-flip when value shape changes (array → nullish)', () => {
    const trace: TraceEntry[] = [{ name: 'items', prev: 'Array(3)', next: 'null', timestamp: 1 }]
    const f = analyzeReactiveTrace(trace, 'items.map is not a function')
    expect(f.some((x) => x.code === 'type-flip')).toBe(true)
  })

  it('no spurious findings for a benign scalar trace', () => {
    const trace: TraceEntry[] = [
      { name: 'count', prev: '0', next: '1', timestamp: 1 },
      { name: 'count', prev: '1', next: '2', timestamp: 2 },
    ]
    const f = analyzeReactiveTrace(trace, 'completely unrelated network error')
    // No correlation, no nullish, no storm, no flip, not empty.
    expect(f).toHaveLength(0)
  })
})

describe('buildErrorDossier', () => {
  const report = {
    // Message includes the signal name "user" so the nullish-then-crash
    // / last-write-correlation heuristics fire (they substring-match the
    // signal name against the message — that correlation is the whole
    // point of the dossier).
    error: {
      message: "Cannot read properties of null (reading 'name') in user",
      name: 'TypeError',
    },
    phase: 'render',
    component: 'UserCard',
    reactiveTrace: [{ name: 'user', prev: 'User {id, name}', next: 'null', timestamp: 5 }],
  }

  it('includes summary, reactive run-up, and suspected cause sections', () => {
    const d = buildErrorDossier(report)
    expect(d).toContain('## Failure summary')
    expect(d).toContain('UserCard')
    expect(d).toContain('## Reactive run-up')
    expect(d).toContain('user: User {id, name} → null')
    expect(d).toContain('## Suspected cause')
    expect(d).toContain('## How to use this')
  })

  it('runs static detection when componentSource is supplied', () => {
    const d = buildErrorDossier(report, {
      // Param-destructure form — the shape detectPyreonPatterns reliably
      // flags as `props-destructured` (mirrors validate.test.ts).
      componentSource: `
        const UserCard = ({ user }: { user: { name: string } }) => {
          return <div>{user.name}</div>
        }
      `,
    })
    expect(d).toContain('## Static issues')
    expect(d).toContain('props-destructured')
  })

  it('clean static analysis section when source has no anti-patterns', () => {
    const d = buildErrorDossier(report, {
      componentSource: `export const Ok = (props) => <div>{props.x}</div>`,
    })
    expect(d).toContain('No Pyreon/React anti-patterns detected')
  })

  it('correlates anti-patterns when catalogue is provided and a finding matches', () => {
    const d = buildErrorDossier(report, {
      antiPatterns: [
        {
          name: 'Static return null for conditional rendering',
          category: 'reactivity',
          categoryHeading: 'Reactivity Mistakes',
          description: 'Components run once — use a reactive accessor.',
          detectorCodes: ['static-return-null-conditional'],
        },
      ],
    })
    // The nullish-then-crash finding relates to static-return-null-conditional.
    expect(d).toContain('## Related anti-patterns from the catalogue')
    expect(d).toContain('Static return null for conditional rendering')
  })

  it('omits the catalogue section when nothing correlates', () => {
    const benign = { error: 'network timeout', reactiveTrace: [] }
    const d = buildErrorDossier(benign, {
      antiPatterns: [
        {
          name: 'X',
          category: 'jsx' as const,
          categoryHeading: 'JSX Mistakes',
          description: 'y',
          detectorCodes: ['for-missing-by'],
        },
      ],
    })
    expect(d).not.toContain('## Related anti-patterns')
  })
})
