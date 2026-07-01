import { describe, expect, it } from 'vitest'
import { detectPyreonPatterns } from '../pyreon-intercept'
import { AUTO_FIXABLE_PYREON_CODES, migratePyreonCode } from '../pyreon-migrate'

describe('migratePyreonCode — mechanical auto-fixes', () => {
  it('signal-write-as-call: `sig(v)` → `sig.set(v)`', () => {
    const r = migratePyreonCode(`const count = signal(0)\ncount(1)`)
    expect(r.code).toContain('count.set(1)')
    expect(r.code).not.toMatch(/count\(1\)/)
    expect(r.changes).toHaveLength(1)
    expect(r.changes[0]).toMatchObject({ code: 'signal-write-as-call', before: 'count(1)', after: 'count.set(1)' })
  })

  it('signal-write-as-call preserves the argument expression', () => {
    const r = migratePyreonCode(`const s = signal(0)\ns(a + b * 2)`)
    expect(r.code).toContain('s.set(a + b * 2)')
  })

  it('does NOT touch a zero-arg read `sig()`', () => {
    const r = migratePyreonCode(`const s = signal(0)\nconst v = s()`)
    expect(r.changes).toHaveLength(0)
    expect(r.code).toContain('const v = s()')
  })

  it('for-with-key: `<For key={k}>` → `<For by={k}>`', () => {
    const r = migratePyreonCode(`<For each={items} key={(i) => i.id}>{(i) => <li />}</For>`)
    expect(r.code).toContain('by={(i) => i.id}')
    expect(r.code).not.toContain('key={')
    expect(r.changes[0]).toMatchObject({ code: 'for-with-key' })
  })

  it('as-unknown-as-vnodechild: drops the double cast', () => {
    const r = migratePyreonCode(`const node = (<li /> as unknown as VNodeChild)`)
    expect(r.code).toContain('(<li />)')
    expect(r.code).not.toContain('as unknown')
    expect(r.changes[0]).toMatchObject({ code: 'as-unknown-as-vnodechild' })
  })

  it('applies multiple fixes in one file, top-to-bottom', () => {
    const r = migratePyreonCode(
      `const s = signal(0)\ns(5)\nconst x = <For each={a} key={k}>{(i) => <li />}</For>`,
    )
    expect(r.code).toContain('s.set(5)')
    expect(r.code).toContain('by={k}')
    expect(r.changes.map((c) => c.code)).toEqual(['signal-write-as-call', 'for-with-key'])
    // reported top-to-bottom (ascending line)
    expect(r.changes[0]!.line).toBeLessThanOrEqual(r.changes[1]!.line)
  })

  it('is idempotent — running twice is stable', () => {
    const once = migratePyreonCode(`const s = signal(0)\ns(1)\n<For each={a} key={k}>{(i) => <li />}</For>`)
    const twice = migratePyreonCode(once.code)
    expect(twice.code).toBe(once.code)
    expect(twice.changes).toHaveLength(0)
  })

  it('round-trip: the migrated code no longer flags any auto-fixable footgun', () => {
    const src = `const s = signal(0)\ns(1)\nconst n = (<li /> as unknown as VNodeChild)\n<For each={a} key={k}>{(i) => <li />}</For>`
    // before: at least one auto-fixable footgun present
    expect(detectPyreonPatterns(src).some((d) => AUTO_FIXABLE_PYREON_CODES.has(d.code))).toBe(true)
    const { code } = migratePyreonCode(src)
    // after: none remain
    expect(detectPyreonPatterns(code).some((d) => AUTO_FIXABLE_PYREON_CODES.has(d.code))).toBe(false)
  })

  it('reports non-fixable footguns in `remaining`, not `changes`', () => {
    const r = migratePyreonCode(`function C(props) {\n  const { title } = props\n  return <div>{title}</div>\n}`)
    expect(r.changes).toHaveLength(0)
    expect(r.remaining.some((x) => x.code === 'props-destructured-body')).toBe(true)
  })

  it('leaves clean code untouched', () => {
    const src = `const s = signal(0)\nconst v = s()\ns.set(5)\n<For each={a} by={k}>{(i) => <li />}</For>`
    const r = migratePyreonCode(src)
    expect(r.code).toBe(src)
    expect(r.changes).toHaveLength(0)
  })

  it('does not mangle unrelated code', () => {
    const src = `import { signal } from '@pyreon/reactivity'\nconst s = signal(0)\nfunction f() { return s() + 1 }\ns(2)`
    const r = migratePyreonCode(src)
    expect(r.code).toContain(`import { signal } from '@pyreon/reactivity'`)
    expect(r.code).toContain('return s() + 1')
    expect(r.code).toContain('s.set(2)')
  })
})
