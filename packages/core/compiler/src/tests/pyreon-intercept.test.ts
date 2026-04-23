import { detectPyreonPatterns, hasPyreonPatterns } from '../pyreon-intercept'

describe('detectPyreonPatterns', () => {
  describe('for-missing-by', () => {
    it('flags <For each={...}> without a `by` prop', () => {
      const code = `
        const items = signal([1, 2, 3])
        const UI = () => <For each={items()}>{(n) => <li>{n}</li>}</For>
      `
      const diags = detectPyreonPatterns(code)
      expect(diags).toHaveLength(1)
      expect(diags[0]!.code).toBe('for-missing-by')
      expect(diags[0]!.message).toContain('keyed reconciler')
    })

    it('does NOT flag <For> that carries a `by`', () => {
      const code = `
        const UI = () => <For each={items()} by={(i) => i.id}>{(i) => <li>{i.name}</li>}</For>
      `
      const diags = detectPyreonPatterns(code)
      expect(diags.filter((d) => d.code === 'for-missing-by')).toEqual([])
    })
  })

  describe('for-with-key', () => {
    it('flags <For key={...}> as the wrong keying prop', () => {
      const code = `
        const UI = () => <For each={items()} key={(i) => i.id}>{(i) => <li>{i.name}</li>}</For>
      `
      const diags = detectPyreonPatterns(code)
      const withKey = diags.find((d) => d.code === 'for-with-key')
      expect(withKey).toBeDefined()
      expect(withKey!.suggested).toContain('by={')
      // fixable stays `false` until a `migrate_pyreon` tool ships; see
      // the top-of-file note on detectPyreonPatterns.
      expect(withKey!.fixable).toBe(false)
    })

    it('does not ALSO flag for-missing-by when for-with-key fires', () => {
      // Otherwise consumers would see two entries for the same mistake.
      const code = `<For each={items} key={(i) => i.id}>{(i) => <li />}</For>`
      const diags = detectPyreonPatterns(code)
      expect(diags.filter((d) => d.code === 'for-missing-by')).toEqual([])
      expect(diags.filter((d) => d.code === 'for-with-key')).toHaveLength(1)
    })
  })

  describe('props-destructured', () => {
    it('flags destructured props on arrow component functions', () => {
      const code = `
        const Greeting = ({ name }: { name: string }) => <div>Hello {name}</div>
      `
      const diags = detectPyreonPatterns(code)
      expect(diags).toHaveLength(1)
      expect(diags[0]!.code).toBe('props-destructured')
      expect(diags[0]!.message).toContain('ONCE')
    })

    it('flags destructured props on function declarations that render JSX', () => {
      const code = `
        function Greeting({ name }: { name: string }) {
          return <div>Hello {name}</div>
        }
      `
      const diags = detectPyreonPatterns(code)
      expect(diags.filter((d) => d.code === 'props-destructured')).toHaveLength(1)
    })

    it('does NOT flag destructured params on non-component callbacks', () => {
      const code = `
        const handler = ({ value }: { value: string }) => console.log(value)
        const reduce = ({ a, b }: { a: number; b: number }) => a + b
      `
      const diags = detectPyreonPatterns(code)
      expect(diags.filter((d) => d.code === 'props-destructured')).toEqual([])
    })

    it('does NOT flag components that accept a single `props` parameter', () => {
      const code = `
        const Greeting = (props: { name: string }) => <div>Hello {props.name}</div>
      `
      const diags = detectPyreonPatterns(code)
      expect(diags.filter((d) => d.code === 'props-destructured')).toEqual([])
    })
  })

  describe('process-dev-gate', () => {
    it('flags typeof process + NODE_ENV production gates', () => {
      const code = `
        if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
          console.warn('dev only')
        }
      `
      const diags = detectPyreonPatterns(code)
      expect(diags).toHaveLength(1)
      expect(diags[0]!.code).toBe('process-dev-gate')
      expect(diags[0]!.suggested).toContain('import.meta.env')
      expect(diags[0]!.fixable).toBe(false)
    })

    it('flags the reversed operand order', () => {
      const code = `
        const IS_DEV = process.env.NODE_ENV !== 'production' && typeof process !== 'undefined'
      `
      const diags = detectPyreonPatterns(code)
      expect(diags.filter((d) => d.code === 'process-dev-gate')).toHaveLength(1)
    })

    it('does NOT flag plain typeof process checks (server-side code is fine)', () => {
      const code = `
        if (typeof process !== 'undefined') {
          process.exit(0)
        }
      `
      const diags = detectPyreonPatterns(code)
      expect(diags).toEqual([])
    })
  })

  describe('empty-theme', () => {
    it('flags `.theme({})` as a no-op chain', () => {
      const code = `
        const Button = rocketstyle('button').attrs({ tag: 'button' }).theme({})
      `
      const diags = detectPyreonPatterns(code)
      expect(diags).toHaveLength(1)
      expect(diags[0]!.code).toBe('empty-theme')
      expect(diags[0]!.fixable).toBe(false)
    })

    it('does NOT flag `.theme(...)` with actual content', () => {
      const code = `
        const Button = rocketstyle('button').theme({ color: 'red' })
      `
      const diags = detectPyreonPatterns(code)
      expect(diags).toEqual([])
    })
  })

  describe('raw-add-event-listener / raw-remove-event-listener', () => {
    it('flags window.addEventListener with useEventListener suggestion', () => {
      const code = `
        const Panel = () => {
          window.addEventListener('resize', () => console.log('resize'))
          return <div />
        }
      `
      const diags = detectPyreonPatterns(code)
      const add = diags.find((d) => d.code === 'raw-add-event-listener')
      expect(add).toBeDefined()
      expect(add!.suggested).toContain('useEventListener')
    })

    it('flags document.removeEventListener', () => {
      const code = `
        document.removeEventListener('click', handler)
      `
      const diags = detectPyreonPatterns(code)
      expect(diags.find((d) => d.code === 'raw-remove-event-listener')).toBeDefined()
    })

    it('does NOT flag addEventListener on host-owned nested paths (e.g. editor.dom)', () => {
      // `view.dom.ownerDocument...` and similar framework-host chains
      // are intentional — the rule should only flag bare window/document
      // and obvious DOM-element identifiers.
      const code = `
        view.dom.ownerDocument.addEventListener('click', h)
      `
      const diags = detectPyreonPatterns(code)
      expect(diags).toEqual([])
    })
  })

  describe('date-math-random-id', () => {
    it('flags Date.now() + Math.random() ID patterns', () => {
      const code = `
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      `
      const diags = detectPyreonPatterns(code)
      // The binary expression and any enclosing template expressions can both
      // match — dedupe by line to keep the contract observable.
      const atLine = [...new Set(diags.filter((d) => d.code === 'date-math-random-id').map((d) => d.line))]
      expect(atLine.length).toBeGreaterThanOrEqual(1)
    })

    it('flags template-literal variants', () => {
      const code = 'const id = `${Date.now()}-${Math.random()}`'
      const diags = detectPyreonPatterns(code)
      expect(diags.find((d) => d.code === 'date-math-random-id')).toBeDefined()
    })

    it('does NOT flag Date.now() alone', () => {
      const code = `const now = Date.now()`
      const diags = detectPyreonPatterns(code)
      expect(diags).toEqual([])
    })
  })

  describe('on-click-undefined', () => {
    it('flags explicit onClick={undefined}', () => {
      const code = `<button onClick={undefined}>Go</button>`
      const diags = detectPyreonPatterns(code)
      expect(diags).toHaveLength(1)
      expect(diags[0]!.code).toBe('on-click-undefined')
      expect(diags[0]!.fixable).toBe(false)
    })

    it('flags other on* handlers set to undefined', () => {
      const code = `<input onInput={undefined} />`
      const diags = detectPyreonPatterns(code)
      expect(diags.find((d) => d.code === 'on-click-undefined')).toBeDefined()
    })

    it('does NOT flag onClick={cond ? handler : undefined} (conditional is safe)', () => {
      const code = `<button onClick={condition ? handler : undefined}>Go</button>`
      const diags = detectPyreonPatterns(code)
      expect(diags.filter((d) => d.code === 'on-click-undefined')).toEqual([])
    })
  })

  describe('hasPyreonPatterns (regex pre-filter)', () => {
    it('returns true for every detected pattern', () => {
      const samples = [
        `<For each={x}>{(i) => <li />}</For>`,
        `typeof process !== 'undefined'`,
        `.theme({})`,
        `window.addEventListener('x', h)`,
        `const id = \`\${Date.now()}-\${Math.random()}\``,
        `<button onClick={undefined}>x</button>`,
        `const X = ({ name }) => <div>{name}</div>`,
      ]
      for (const s of samples) {
        expect(hasPyreonPatterns(s)).toBe(true)
      }
    })

    it('returns false for unrelated code', () => {
      expect(hasPyreonPatterns(`const x = 1 + 2`)).toBe(false)
      expect(hasPyreonPatterns(`console.log('ok')`)).toBe(false)
    })
  })

  describe('combined scenarios', () => {
    it('finds every distinct pattern in a multi-issue file', () => {
      const code = `
        const List = ({ items }) => <For each={items}>{(i) => <li />}</For>
        const flag = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
        window.addEventListener('resize', () => {})
        const Styled = rocketstyle('div').theme({})
        const id = Date.now() + Math.random()
        const Btn = () => <button onClick={undefined}>x</button>
      `
      const diags = detectPyreonPatterns(code)
      const codes = new Set(diags.map((d) => d.code))
      expect(codes.has('for-missing-by')).toBe(true)
      expect(codes.has('props-destructured')).toBe(true)
      expect(codes.has('process-dev-gate')).toBe(true)
      expect(codes.has('raw-add-event-listener')).toBe(true)
      expect(codes.has('empty-theme')).toBe(true)
      expect(codes.has('date-math-random-id')).toBe(true)
      expect(codes.has('on-click-undefined')).toBe(true)
    })

    it('returns an empty array for idiomatic Pyreon code', () => {
      const code = `
        import { signal, effect } from '@pyreon/reactivity'
        import { useEventListener } from '@pyreon/hooks'

        const Counter = (props: { initial?: number }) => {
          const count = signal(props.initial ?? 0)
          useEventListener(window, 'keydown', () => count.update((n) => n + 1))
          return (
            <For each={items()} by={(i) => i.id}>
              {(i) => <li>{i.name}: {count()}</li>}
            </For>
          )
        }
      `
      expect(detectPyreonPatterns(code)).toEqual([])
    })
  })

  describe('fixable contract — ALL Pyreon codes are fixable:false', () => {
    // Binding invariant: until a `migrate_pyreon` tool exists, every
    // Pyreon diagnostic must report `fixable: false`. Claiming a code
    // is auto-fixable while no migrator handles it would mislead
    // consumers building on the flag. Flip to `true` only when the
    // companion migrator lands in a subsequent PR.
    it('never emits a Pyreon diagnostic with fixable: true', () => {
      const snippets = [
        `<For each={x} key={(i) => i.id}>{(i) => <li />}</For>`, // for-with-key
        `<For each={x}>{(i) => <li />}</For>`, // for-missing-by
        `const X = ({ y }) => <div>{y}</div>`, // props-destructured
        `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`, // process-dev-gate
        `rocketstyle('div').theme({})`, // empty-theme
        `window.addEventListener('x', h)`, // raw-add-event-listener
        `document.removeEventListener('x', h)`, // raw-remove-event-listener
        'const id = `${Date.now()}-${Math.random()}`', // date-math-random-id
        `<button onClick={undefined}>x</button>`, // on-click-undefined
      ]
      for (const code of snippets) {
        const diags = detectPyreonPatterns(code)
        for (const d of diags) {
          expect(d.fixable, `${d.code} must be fixable:false`).toBe(false)
        }
      }
    })
  })

  describe('diagnostic shape', () => {
    it('emits 1-based line + 0-based column with trimmed current/suggested', () => {
      const code = `\n\n  <For each={items}>{(i) => <li />}</For>`
      const diags = detectPyreonPatterns(code)
      expect(diags[0]!.line).toBe(3)
      expect(diags[0]!.column).toBeGreaterThanOrEqual(0)
      expect(diags[0]!.current).not.toMatch(/^\s/)
      expect(diags[0]!.suggested).not.toMatch(/^\s/)
    })

    it('sorts diagnostics by line ascending', () => {
      const code = `
        const A = () => <button onClick={undefined} />
        const B = () => <For each={x} />
        const C = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
      `
      const diags = detectPyreonPatterns(code)
      const lines = diags.map((d) => d.line)
      expect(lines).toEqual([...lines].sort((a, b) => a - b))
    })
  })
})
