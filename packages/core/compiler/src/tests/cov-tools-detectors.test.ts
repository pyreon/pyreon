/**
 * Branch-coverage specs for the two pattern detectors and the Pyreon
 * codemod — `detectPyreonPatterns`, `detectReactPatterns`,
 * `migrateReactCode`, `migratePyreonCode` — all public entry points.
 *
 * The discipline throughout: every spec asserts the shape that FIRES a
 * detector code beside the corrected / near-miss shape that must stay
 * QUIET. A detector that reports unconditionally satisfies the first half
 * on its own, so the quiet half is the load-bearing one.
 */
import { describe, expect, it } from 'vitest'
import { detectPyreonPatterns, type PyreonDiagnosticCode } from '../pyreon-intercept'
import { migratePyreonCode } from '../pyreon-migrate'
import { detectReactPatterns, migrateReactCode } from '../react-intercept'

const pyreonCodes = (src: string, file = 'input.tsx'): PyreonDiagnosticCode[] =>
  detectPyreonPatterns(src, file).map((d) => d.code)
const reactCodes = (src: string, file = 'input.tsx'): string[] =>
  detectReactPatterns(src, file).map((d) => d.code)

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-intercept — props destructuring + JSX detection
// ═══════════════════════════════════════════════════════════════════════════

describe('detectPyreonPatterns — props-destructured', () => {
  it('fires on a destructuring component and stays quiet on `props.x`', () => {
    expect(pyreonCodes(`function C({ name }) { return <div>{name}</div> }`)).toContain(
      'props-destructured',
    )
    expect(pyreonCodes(`function C(props) { return <div>{props.name}</div> }`)).not.toContain(
      'props-destructured',
    )
  })

  it('stays quiet on an EMPTY binding pattern — nothing was captured', () => {
    expect(pyreonCodes(`function C({}) { return <div /> }`)).not.toContain('props-destructured')
  })

  it('stays quiet on a destructuring callback that renders no JSX', () => {
    expect(pyreonCodes(`const f = ({ a, b }) => a + b`)).not.toContain('props-destructured')
  })

  it('recognizes an EXPRESSION-bodied arrow component (no block to walk)', () => {
    expect(pyreonCodes(`const C = ({ name }) => <div>{name}</div>`)).toContain(
      'props-destructured',
    )
    // The fragment form takes the same arm.
    expect(pyreonCodes(`const C = ({ name }) => <>{name}</>`)).toContain('props-destructured')
  })

  it('recognizes a FunctionDeclaration whose JSX is nested in its block', () => {
    expect(
      pyreonCodes(`function C({ name }) { const x = 1; return <span>{name}{x}</span> }`),
    ).toContain('props-destructured')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-intercept — process dev-gate
// ═══════════════════════════════════════════════════════════════════════════

describe('detectPyreonPatterns — process-dev-gate near-misses', () => {
  const FIRES = `if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') { console.warn('x') }`

  it('fires on the canonical two-sided guard', () => {
    expect(pyreonCodes(FIRES, 'a.ts')).toContain('process-dev-gate')
  })

  it.each([
    ['equality instead of inequality on the typeof half', `typeof process === 'undefined' && process.env.NODE_ENV !== 'production'`],
    ['a typeof on something other than process', `typeof window !== 'undefined' && process.env.NODE_ENV !== 'production'`],
    ['a non-binary right operand', `typeof process !== 'undefined' && DEV`],
    ['equality on the NODE_ENV half', `typeof process !== 'undefined' && process.env.NODE_ENV === 'production'`],
    ['a bare identifier left side', `typeof process !== 'undefined' && dev !== 'production'`],
    ['a different env key', `typeof process !== 'undefined' && process.env.MODE !== 'production'`],
    ['no `env` segment', `typeof process !== 'undefined' && env.NODE_ENV !== 'production'`],
    ['a deeper receiver chain', `typeof process !== 'undefined' && a.b.env.NODE_ENV !== 'production'`],
    ['a non-process global', `typeof process !== 'undefined' && globalThis.env.NODE_ENV !== 'production'`],
    ['a non-production comparand', `typeof process !== 'undefined' && process.env.NODE_ENV !== 'prod'`],
    ['a || instead of &&', `typeof process !== 'undefined' || process.env.NODE_ENV !== 'production'`],
  ])('stays quiet for %s', (_label, expr) => {
    expect(pyreonCodes(`if (${expr}) { console.warn('x') }`, 'a.ts')).not.toContain(
      'process-dev-gate',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-intercept — empty-theme / raw listeners / id generation / onClick
// ═══════════════════════════════════════════════════════════════════════════

describe('detectPyreonPatterns — empty-theme arity + argument shape', () => {
  it('fires on `.theme({})` only', () => {
    expect(pyreonCodes(`const B = base.theme({})`, 'a.ts')).toContain('empty-theme')
  })

  it.each([
    ['no arguments', `base.theme()`],
    ['two arguments', `base.theme({}, {})`],
    ['a non-literal argument', `base.theme(sharedTheme)`],
    ['a non-empty object', `base.theme({ color: 'red' })`],
  ])('stays quiet for %s', (_label, expr) => {
    expect(pyreonCodes(`const B = ${expr}`, 'a.ts')).not.toContain('empty-theme')
  })
})

describe('detectPyreonPatterns — raw addEventListener targets', () => {
  it('fires for a `window` target and stays quiet for a framework host chain', () => {
    expect(pyreonCodes(`window.addEventListener('x', fn)`, 'a.ts')).toContain(
      'raw-add-event-listener',
    )
    expect(pyreonCodes(`view.dom.addEventListener('x', fn)`, 'a.ts')).not.toContain(
      'raw-add-event-listener',
    )
  })

  it('stays quiet when the receiver is a CALL (no identifier name to match)', () => {
    expect(pyreonCodes(`getEl().addEventListener('x', fn)`, 'a.ts')).not.toContain(
      'raw-add-event-listener',
    )
  })

  it('stays quiet for a PRIVATE-identifier method call', () => {
    const src = `class A { #addEventListener() {} run() { this.#addEventListener() } }`
    expect(pyreonCodes(src, 'a.ts')).not.toContain('raw-add-event-listener')
  })

  it('fires for removeEventListener on a DOM-ish identifier', () => {
    expect(pyreonCodes(`el.removeEventListener('x', fn)`, 'a.ts')).toContain(
      'raw-remove-event-listener',
    )
  })
})

describe('detectPyreonPatterns — date-math-random-id needs BOTH halves', () => {
  it('fires when Date.now() and Math.random() appear together', () => {
    expect(
      pyreonCodes(`const id = Date.now() + Math.random().toString(36)`, 'a.ts'),
    ).toContain('date-math-random-id')
  })

  it('stays quiet for Date.now() alone', () => {
    expect(pyreonCodes(`const id = String(Date.now())`, 'a.ts')).not.toContain(
      'date-math-random-id',
    )
  })

  it('stays quiet for Math.random() alone', () => {
    expect(pyreonCodes(`const id = Math.random().toString(36)`, 'a.ts')).not.toContain(
      'date-math-random-id',
    )
  })
})

describe('detectPyreonPatterns — on-click-undefined attribute shapes', () => {
  it('fires on an explicit `onClick={undefined}`', () => {
    expect(pyreonCodes(`const A = <button onClick={undefined} />`)).toContain(
      'on-click-undefined',
    )
  })

  it.each([
    ['a NAMESPACED attribute name', `<button on:click={undefined} />`],
    ['a string initializer', `<button onClick="undefined" />`],
    ['no initializer at all', `<button onClick />`],
    ['an EMPTY expression container', `<button onClick={} />`],
    ['a real handler', `<button onClick={fn} />`],
    ['a non-`on` attribute', `<button title={undefined} />`],
    ['a two-character attribute name', `<button on={undefined} />`],
  ])('stays quiet for %s', (_label, jsx) => {
    expect(pyreonCodes(`const A = ${jsx}`)).not.toContain('on-click-undefined')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-intercept — binding collection (otherBound / omitted elements)
// ═══════════════════════════════════════════════════════════════════════════

describe('detectPyreonPatterns — accessor binding collection', () => {
  it('skips an ARRAY-ELISION binding element while still binding the named one', () => {
    // `const [, setCount] = useState(0)` binds only `setCount`; the elision
    // must not be dereferenced.
    const src =
      `import { useState } from 'react'\n` +
      `const [, setCount] = useState(0)\n` +
      `const label = \`v\${setCount}\`\n`
    expect(() => detectPyreonPatterns(src, 'a.ts')).not.toThrow()
    expect(pyreonCodes(src, 'a.ts')).not.toContain('accessor-uncalled-in-template')
  })

  it('treats a DEFAULT-imported name as ambiguous, so the template detector stays quiet', () => {
    const shadowed =
      `import count from './count'\n` +
      `const count2 = signal(0)\n` +
      `const s = \`w=\${count}%\`\n`
    expect(pyreonCodes(shadowed, 'a.ts')).not.toContain('accessor-uncalled-in-template')
  })

  it('fires for a genuinely tracked signal interpolated uncalled', () => {
    const src = `const width = signal(10)\nconst s = \`w=\${width}%\`\n`
    expect(pyreonCodes(src, 'a.ts')).toContain('accessor-uncalled-in-template')
  })

  it('stays quiet when the template CALLS the accessor', () => {
    const src = `const width = signal(10)\nconst s = \`w=\${width()}%\`\n`
    expect(pyreonCodes(src, 'a.ts')).not.toContain('accessor-uncalled-in-template')
  })

  it('sees through parens / satisfies / non-null layers when deciding "is it called"', () => {
    for (const call of ['(width)()', '(width satisfies never)()', 'width!()']) {
      const src = `const width = signal(10)\nconst s = \`w=\${${call}}%\`\n`
      expect(pyreonCodes(src, 'a.ts')).not.toContain('accessor-uncalled-in-template')
    }
  })

  it('is not silenced by an unrelated member call in the same template', () => {
    const src = `const width = signal(10)\nconst s = \`w=\${obj.width()}-\${width}\`\n`
    expect(pyreonCodes(src, 'a.ts')).toContain('accessor-uncalled-in-template')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-intercept — early-return conditionals
// ═══════════════════════════════════════════════════════════════════════════

describe('detectPyreonPatterns — static early returns', () => {
  it('fires on `if (sig()) return null` in a component, quiet on the Show form', () => {
    const broken = `const c = signal(false)\nfunction C(props) { if (c()) return null\n  return <div /> }`
    expect(pyreonCodes(broken)).toContain('static-return-null-conditional')
    const fixed = `const c = signal(false)\nfunction C(props) { return <Show when={() => c()}><div /></Show> }`
    expect(pyreonCodes(fixed)).not.toContain('static-return-null-conditional')
  })

  it('accepts the BLOCK form of the null return', () => {
    const src = `const c = signal(false)\nfunction C(props) { if (c()) { return null }\n  return <div /> }`
    expect(pyreonCodes(src)).toContain('static-return-null-conditional')
  })

  it('fires on a non-null early return, and NOT when the block has two statements', () => {
    const one = `const l = signal(false)\nfunction C(props) { if (l()) return <Skeleton />\n  return <div /> }`
    expect(pyreonCodes(one)).toContain('static-early-return-conditional')
    const two = `const l = signal(false)\nfunction C(props) { if (l()) { log(); return <Skeleton /> }\n  return <div /> }`
    expect(pyreonCodes(two)).not.toContain('static-early-return-conditional')
  })

  it('never double-fires both early-return codes on one statement', () => {
    const src = `const c = signal(false)\nfunction C(props) { if (c()) return null\n  return <div /> }`
    const codes = pyreonCodes(src)
    expect(codes.filter((c) => c === 'static-early-return-conditional')).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-intercept — as unknown as VNodeChild
// ═══════════════════════════════════════════════════════════════════════════

describe('detectPyreonPatterns — as-unknown-as-vnodechild', () => {
  it('fires on the double cast and stays quiet on `as any as VNodeChild`', () => {
    expect(pyreonCodes(`const c = x as unknown as VNodeChild`, 'a.ts')).toContain(
      'as-unknown-as-vnodechild',
    )
    expect(pyreonCodes(`const c = x as any as VNodeChild`, 'a.ts')).not.toContain(
      'as-unknown-as-vnodechild',
    )
  })

  it('stays quiet on a single cast and on a different target type', () => {
    expect(pyreonCodes(`const c = x as VNodeChild`, 'a.ts')).not.toContain(
      'as-unknown-as-vnodechild',
    )
    expect(pyreonCodes(`const c = x as unknown as VNode`, 'a.ts')).not.toContain(
      'as-unknown-as-vnodechild',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-intercept — island 'never' + registry
// ═══════════════════════════════════════════════════════════════════════════

describe('detectPyreonPatterns — island-never-with-registry-entry', () => {
  const NEVER = `const W = island(() => import('./w'), { name: 'W', hydrate: 'never' })\n`

  it('fires when the never-island is registered, quiet when it is not', () => {
    expect(pyreonCodes(`${NEVER}hydrateIslands({ W: () => import('./w') })`, 'a.ts')).toContain(
      'island-never-with-registry-entry',
    )
    expect(pyreonCodes(`${NEVER}hydrateIslands({ Other: () => import('./o') })`, 'a.ts')).not.toContain(
      'island-never-with-registry-entry',
    )
  })

  it('stays quiet when the registry argument is not an object literal', () => {
    expect(pyreonCodes(`${NEVER}hydrateIslands(registry)`, 'a.ts')).not.toContain(
      'island-never-with-registry-entry',
    )
  })

  it('skips a spread + computed key in the registry but keeps a shorthand entry', () => {
    const src = `${NEVER}const W2 = 1\nhydrateIslands({ ...base, [k]: 1, W })`
    expect(pyreonCodes(src, 'a.ts')).toContain('island-never-with-registry-entry')
  })

  it('reads a STRING-LITERAL registry key', () => {
    expect(pyreonCodes(`${NEVER}hydrateIslands({ 'W': () => import('./w') })`, 'a.ts')).toContain(
      'island-never-with-registry-entry',
    )
  })

  it('declines a non-object island options argument, so nothing is collected', () => {
    expect(
      pyreonCodes(`const W = island(() => import('./w'), opts)\nhydrateIslands({ W: 1 })`, 'a.ts'),
    ).not.toContain('island-never-with-registry-entry')
  })

  it('skips a spread + string key + computed key inside the island options', () => {
    const src =
      `const W = island(() => import('./w'), { ...base, [k]: 1, 'name': 'W', hydrate: 'never' })\n` +
      `hydrateIslands({ W: () => import('./w') })`
    expect(pyreonCodes(src, 'a.ts')).toContain('island-never-with-registry-entry')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-intercept — JSX tag-name helper
// ═══════════════════════════════════════════════════════════════════════════

describe('detectPyreonPatterns — For/key detection across tag-name shapes', () => {
  it('fires on `<For key=…>` and stays quiet on `<For by=…>`', () => {
    expect(pyreonCodes(`const L = <For each={xs} key={(x) => x.id}>{r}</For>`)).toContain(
      'for-with-key',
    )
    expect(pyreonCodes(`const L = <For each={xs} by={(x) => x.id}>{r}</For>`)).not.toContain(
      'for-with-key',
    )
  })

  it('stays quiet for a MEMBER-expression tag (no bare identifier name)', () => {
    expect(pyreonCodes(`const L = <Ns.For each={xs} key={(x) => x.id}>{r}</Ns.For>`)).not.toContain(
      'for-with-key',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// react-intercept — detection arms
// ═══════════════════════════════════════════════════════════════════════════

describe('detectReactPatterns — useState binding shapes', () => {
  it('names the value binding, and falls back to `value` for an ELIDED first element', () => {
    const named = detectReactPatterns(`const [count, setCount] = useState(0)`, 'a.ts')
    expect(named.find((d) => d.code === 'use-state')?.suggested).toContain('count')
    const elided = detectReactPatterns(`const [, setCount] = useState(0)`, 'a.ts')
    expect(elided.find((d) => d.code === 'use-state')?.suggested).toContain('value')
  })

  it('still reports a non-destructured useState through the generic arm', () => {
    expect(reactCodes(`const s = useState(0)`, 'a.ts')).toContain('use-state')
  })
})

describe('detectReactPatterns — useEffect deps shapes', () => {
  it('reports the mount form for empty deps, with/without a cleanup return', () => {
    const withCleanup = detectReactPatterns(
      `useEffect(() => { const t = setInterval(f, 1); return () => clearInterval(t) }, [])`,
      'a.ts',
    )
    expect(withCleanup.find((d) => d.code === 'use-effect-mount')?.suggested).toContain('cleanup')
    const without = detectReactPatterns(`useEffect(() => { f() }, [])`, 'a.ts')
    expect(without.find((d) => d.code === 'use-effect-mount')?.suggested).not.toContain('cleanup')
  })

  it('reports the deps form for a non-empty array', () => {
    expect(reactCodes(`useEffect(() => { f() }, [a, b])`, 'a.ts')).toContain('use-effect-deps')
  })

  it('reports the no-deps form when the second argument is absent', () => {
    expect(reactCodes(`useEffect(() => { f() })`, 'a.ts')).toContain('use-effect-no-deps')
  })

  it('reports NOTHING when the deps argument is present but not an array literal', () => {
    const codes = reactCodes(`useEffect(() => { f() }, deps)`, 'a.ts')
    expect(codes).not.toContain('use-effect-mount')
    expect(codes).not.toContain('use-effect-deps')
    expect(codes).not.toContain('use-effect-no-deps')
  })
})

describe('detectReactPatterns — onChange advice is input-type aware', () => {
  it('fires on a text input and a textarea', () => {
    expect(reactCodes(`const A = <input type="text" onChange={f} />`)).toContain('on-change-input')
    expect(reactCodes(`const A = <textarea onChange={f} />`)).toContain('on-change-input')
  })

  it('stays quiet for a commit-on-select self-closing input', () => {
    expect(reactCodes(`const A = <input type="checkbox" onChange={f} />`)).not.toContain(
      'on-change-input',
    )
  })

  it('fires for a DYNAMIC type (cannot prove commit-on-select)', () => {
    expect(reactCodes(`const A = <input type={kind} onChange={f} />`)).toContain('on-change-input')
  })

  it('reads the type off a NON-self-closing input too — a checkbox with a closing tag is quiet', () => {
    // This spec used to pin the opposite: the probe read only self-closing
    // and full elements, so the opening element the caller passes had no
    // `type` and a checkbox was reported as text-like. Corrected in
    // react-intercept.ts; `on-change-input-opening-element.test.ts` is the
    // bisect-verified lock.
    expect(reactCodes(`const A = <input type="checkbox" onChange={f}></input>`)).not.toContain(
      'on-change-input',
    )
  })

  it('stays quiet for onChange on a non-form element', () => {
    expect(reactCodes(`const A = <div onChange={f} />`)).not.toContain('on-change-input')
  })
})

describe('detectReactPatterns — .value writes and .map() in JSX', () => {
  it('fires only on a WRITE to a tracked signal binding', () => {
    const write = `const s = signal(0)\ns.value = 1\n`
    expect(reactCodes(write, 'a.ts')).toContain('dot-value-signal')
    const read = `const s = signal(0)\nconst v = s.value\n`
    expect(reactCodes(read, 'a.ts')).not.toContain('dot-value-signal')
  })

  it('stays quiet for a `.value` write on an untracked receiver', () => {
    expect(reactCodes(`input.value = ''`, 'a.ts')).not.toContain('dot-value-signal')
  })

  it('fires for `.map()` INSIDE a JSX expression and not outside one', () => {
    expect(reactCodes(`const L = <ul>{items.map((i) => <li>{i}</li>)}</ul>`)).toContain('array-map-jsx')
    expect(reactCodes(`const rows = items.map((i) => i * 2)`, 'a.ts')).not.toContain('array-map-jsx')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// react-intercept — migrateReactCode
// ═══════════════════════════════════════════════════════════════════════════

describe('migrateReactCode — hook rewrites', () => {
  it('rewrites a destructured useState and leaves a non-destructured one alone', () => {
    expect(migrateReactCode(`const [c, setC] = useState(0)`, 'a.ts').code).toContain(
      'c = signal(0)',
    )
    const plain = migrateReactCode(`const s = useState(0)`, 'a.ts')
    expect(plain.code).toContain('useState(0)')
  })

  it('names an ELIDED first binding element `value`', () => {
    expect(migrateReactCode(`const [, setC] = useState(0)`, 'a.ts').code).toContain(
      'value = signal(0)',
    )
  })

  it('rewrites useState() with NO initializer to signal(undefined)', () => {
    expect(migrateReactCode(`const [c, setC] = useState()`, 'a.ts').code).toContain(
      'signal(undefined)',
    )
  })

  it('rewrites useEffect(fn, nonArrayDeps) to effect(fn)', () => {
    const r = migrateReactCode(`useEffect(() => { f() }, deps)`, 'a.ts')
    expect(r.code).toContain('effect(')
    expect(r.changes.some((c) => c.description.includes('auto-tracks deps'))).toBe(true)
  })

  it('leaves a zero-argument useEffect / useMemo / useCallback untouched', () => {
    expect(migrateReactCode(`useEffect()`, 'a.ts').code).toContain('useEffect()')
    expect(migrateReactCode(`useMemo()`, 'a.ts').code).toContain('useMemo()')
    expect(migrateReactCode(`useCallback()`, 'a.ts').code).toContain('useCallback()')
  })

  it('rewrites useMemo / useCallback when the callback IS present', () => {
    expect(migrateReactCode(`const v = useMemo(() => a + b, [a, b])`, 'a.ts').code).toContain(
      'computed(',
    )
    expect(migrateReactCode(`const f = useCallback(() => a, [a])`, 'a.ts').code).not.toContain(
      'useCallback',
    )
  })
})

describe('migrateReactCode — JSX attribute rewrites', () => {
  it('rewrites onChange on a form control and leaves it on other tags', () => {
    expect(migrateReactCode(`const A = <input onChange={f} />`).code).toContain('onInput')
    expect(migrateReactCode(`const A = <div onChange={f} />`).code).toContain('onChange')
  })

  it('leaves onChange on a MEMBER-expression tag alone (no bare tag name)', () => {
    expect(migrateReactCode(`const A = <Ns.Input onChange={f} />`).code).toContain('onChange')
  })

  it('rewrites dangerouslySetInnerHTML only when `__html` is present', () => {
    expect(
      migrateReactCode(`const A = <div dangerouslySetInnerHTML={{ __html: raw }} />`).code,
    ).toContain('innerHTML={raw}')
    const noHtml = migrateReactCode(`const A = <div dangerouslySetInnerHTML={{ other: raw }} />`)
    expect(noHtml.code).toContain('dangerouslySetInnerHTML')
    const notObject = migrateReactCode(`const A = <div dangerouslySetInnerHTML={cfg} />`)
    expect(notObject.code).toContain('dangerouslySetInnerHTML')
    const noInit = migrateReactCode(`const A = <div dangerouslySetInnerHTML />`)
    expect(noInit.code).toContain('dangerouslySetInnerHTML')
  })
})

describe('migrateReactCode — import block placement', () => {
  it('appends new imports AFTER the last existing import line', () => {
    const r = migrateReactCode(
      `import { useState } from 'react'\nconst [c, setC] = useState(0)\n`,
      'a.ts',
    )
    const lines = r.code.split('\n')
    const firstNonImport = lines.findIndex((l) => l.trim() && !l.startsWith('import'))
    expect(lines.slice(0, firstNonImport).some((l) => l.includes('@pyreon/reactivity'))).toBe(true)
  })

  it('PREPENDS the import block when the file has no imports at all', () => {
    const r = migrateReactCode(`const [c, setC] = useState(0)\n`, 'a.ts')
    expect(r.code.startsWith('import {')).toBe(true)
    expect(r.code).toContain('@pyreon/reactivity')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-migrate
// ═══════════════════════════════════════════════════════════════════════════

describe('migratePyreonCode — parse mode + fix shapes', () => {
  it('parses JSX for .tsx and .jsx, and plain TS for .ts', () => {
    const jsx = `const L = <For each={xs} key={k}>{r}</For>`
    expect(migratePyreonCode(jsx, 'a.tsx').code).toContain('by={k}')
    expect(migratePyreonCode(jsx, 'a.jsx').code).toContain('by={k}')
    // A `.ts` file is parsed as TS, so the same text is not JSX and no
    // `<For>` attribute rewrite happens.
    const ts = migratePyreonCode(`const s = signal(0)\ns(1)\n`, 'a.ts')
    expect(ts.code).toContain('s.set(1)')
  })

  it('renames `key` to `by` only when no `by` attribute already exists', () => {
    expect(migratePyreonCode(`const L = <For each={xs} key={k} />`, 'a.tsx').code).toContain(
      'by={k}',
    )
    const both = migratePyreonCode(`const L = <For each={xs} key={k} by={b} />`, 'a.tsx')
    expect(both.code).toContain('key={k}')
    const neither = migratePyreonCode(`const L = <For each={xs} />`, 'a.tsx')
    expect(neither.code).toBe(`const L = <For each={xs} />`)
  })

  it('removes `as unknown as VNodeChild` but keeps `as any as VNodeChild`', () => {
    expect(migratePyreonCode(`const c = x as unknown as VNodeChild`, 'a.ts').code).toBe(
      'const c = x',
    )
    const anyCast = `const c = x as any as VNodeChild`
    expect(migratePyreonCode(anyCast, 'a.ts').code).toBe(anyCast)
  })
})
