import { describe, expect, it } from 'vitest'
import { explainReactivity } from '../explain-reactivity'

describe('explain_reactivity — the compiler reactivity verdict for agents', () => {
  it('classifies a reactive signal read as live', () => {
    const r = explainReactivity(
      `function Counter() {
        const count = signal(0)
        return <div>{count()}</div>
      }`,
      'Counter.tsx',
    )
    expect(r.live).toBeGreaterThanOrEqual(1)
    expect(r.footguns).toBe(0)
    expect(r.text).toContain('Reactivity map for Counter.tsx')
    expect(r.text).toContain('live')
  })

  it('flags destructured props as a footgun AND shows the baked-static read', () => {
    const r = explainReactivity(
      `function Card(props) {
        const { title } = props
        return <div>{title}</div>
      }`,
      'Card.tsx',
    )
    // props-destructured footgun fires
    expect(r.footguns).toBeGreaterThanOrEqual(1)
    expect(r.text).toContain('props-destructured')
    // the {title} read is baked static (captured once)
    expect(r.staticCount).toBeGreaterThanOrEqual(1)
    // the actionable note appears when something is baked static
    expect(r.text).toContain('baked STATIC')
  })

  it('renders an annotated source block', () => {
    const r = explainReactivity(
      `function C() {
        const name = signal('a')
        return <span>{name()}</span>
      }`,
      'C.tsx',
    )
    // the formatReactivityLens code fence + line numbers
    expect(r.text).toContain('```')
    expect(r.text).toMatch(/\d+ \|/)
  })

  it('reports no reactive expressions for a non-JSX / plain snippet', () => {
    const r = explainReactivity(`const x = 1 + 2`, 'plain.ts')
    expect(r.live).toBe(0)
    expect(r.staticCount).toBe(0)
    expect(r.footguns).toBe(0)
    expect(r.text).toContain('No reactive expressions detected')
  })

  it('summary counts reflect the finding kinds (live + static + footgun)', () => {
    const r = explainReactivity(
      `function Mixed(props) {
        const { a } = props
        const live = signal(0)
        return <div>{a}{live()}</div>
      }`,
      'Mixed.tsx',
    )
    expect(r.text).toContain(
      `${r.live} live · ${r.staticCount} baked-static · ${r.footguns} footgun`,
    )
  })
})
