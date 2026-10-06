import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transform } from './first-party-plugins'

// Anonymous record names include a stable hash of their source location. The
// Plain and classic fixtures intentionally have different prologues, so that
// implementation detail differs even when their emitted programs are equal.
const normalizeAnonymousRecordNames = (code: string): string => code.replace(/__Obj\d+_[a-z0-9]+/g, '__Obj')

// Two PMTC defects surfaced by migrating the native examples to Plain Mode.

// A real app that exercises the counters (timeline strips + host-state
// renames) — a small synthetic fixture did not reach them and passed against
// the broken build.
const TASKS_APP = fileURLToPath(new URL('../../../../../examples/native-tasks/src/TasksApp.tsx', import.meta.url))

describe('PMTC emit is a pure function of its source', () => {
  it.each(['swift', 'kotlin'] as const)('%s: compiling the same file twice yields identical output', (target) => {
    // Module-level name counters (timeline strips, host-state renames) were
    // never reset between transform() calls, so generated names depended on
    // what else the process had compiled first — CLI builds, watchers, tests.
    const src = readFileSync(TASKS_APP, 'utf8')
    const a = transform(src, { target, filename: TASKS_APP }).code
    const b = transform(src, { target, filename: TASKS_APP }).code
    expect(b).toBe(a)
  })
})

describe("Plain Mode's total-tracking prologue lowers to its value", () => {
  const plain = `import { state, derived } from '@pyreon/core/plain'
import { Text } from '@pyreon/primitives'
export function D() {
  let pick = state(-1)
  let items = state.raw([{ name: 'a' }])
  const label = derived(() => (pick < 0 ? 'none' : items[pick]!.name))
  return <Text>{label}</Text>
}`
  const classic = `import { signal, computed } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function D() {
  const pick = signal(-1)
  const items = signal([{ name: 'a' }])
  const label = computed(() => (pick() < 0 ? 'none' : items()[pick()]!.name))
  return <Text>{label()}</Text>
}`
  it.each(['swift', 'kotlin'] as const)('%s: `(void (…), expr)` emits exactly like the classic twin', (target) => {
    // The pre-pass hoists a conditionally-read dep into `void (items())`; PMTC
    // used to fall back to an EMPTY STRING for the whole derived value.
    const p = transform(plain, { target, filename: 'd.tsx' })
    const c = transform(classic, { target, filename: 'd.tsx' })
    expect(normalizeAnonymousRecordNames(p.code)).toBe(normalizeAnonymousRecordNames(c.code))
    expect(p.warnings).toEqual(c.warnings)
  })

  it('a real comma expression with side effects still warns', () => {
    const src = `import { signal, computed } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function E() {
  const a = signal(1)
  const v = computed(() => (log(a()), a() + 1))
  return <Text>{v()}</Text>
}`
    const r = transform(src, { target: 'swift', filename: 'e.tsx' })
    expect(r.warnings.some((w) => w.includes('SequenceExpression'))).toBe(true)
  })
})
