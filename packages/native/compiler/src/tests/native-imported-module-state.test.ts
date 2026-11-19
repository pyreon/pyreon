// A module-scope `signal()` / `computed()` IMPORTED from another file is named, on both targets (#4313).
//
// Module state lowers to one singleton per compiled file (`module-state.ts`). A file that imports it from another
// module has no singleton to read it through, so the emit referenced bare names (`plan.set(…)`, `seats + 1`) that
// exist in neither language, and `pyreon-native check` reported 0 warnings. It has no lowering yet; it is now a
// named warning at the import, for every import shape, so `check` no longer passes a file the build rejects.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const root = mkdtempSync(join(tmpdir(), 'pyreon-imported-module-state-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

let n = 0

/** Write `files` under a fresh directory and return the absolute path and source of `entry`. */
function project(files: Record<string, string>, entry = 'App.tsx'): { path: string; source: string } {
  const dir = join(root, `p${n++}`)
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
  }

  return { path: join(dir, entry), source: files[entry]! }
}

const both = ['swift', 'kotlin'] as const

const CART = `import { signal, computed } from '@pyreon/reactivity'
export const plan = signal('free')
export const seats = signal(1)
export const monthly = computed(() => (plan() === 'pro' ? 12 * seats() : 0))
export const TAX = 0.2
export function label(n: number): string { return \`\${n} seats\` }
`

/** A component reading and writing `plan`, `seats`, `monthly` under the names `imports` binds. */
const app = (imports: string, p = 'plan', s = 'seats', m = 'monthly') => `import { Stack, Text, Button } from '@pyreon/primitives'
${imports}
export function PlanPicker() {
  return (
    <Stack>
      <Button onPress={() => ${p}.set('pro')}>Pro</Button>
      <Button onPress={() => ${s}.set(${s}() + 1)}>Add a seat</Button>
      <Text>{\`\${${m}()} a month\`}</Text>
    </Stack>
  )
}
`

/** The module-state warnings, keyed by the local name each one starts with. */
function stateWarnings(warnings: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const w of warnings) {
    const m = /^`([\w.$]+)` is a module-scope (signal|computed)\(\) imported from /.exec(w)
    if (m) out.set(m[1]!, w)
  }

  return out
}

describe('the issue #4313 shape: named imports of module signals and a computed', () => {
  const p = project({ 'App.tsx': app("import { plan, seats, monthly } from './cart'"), 'cart.ts': CART })

  for (const target of both) {
    it(`${target}: each imported state is named once, with what to do instead`, () => {
      const r = transform(p.source, { target, filename: p.path })
      const named = stateWarnings(r.warnings)
      expect([...named.keys()].sort(), r.warnings.join('\n')).toEqual(['monthly', 'plan', 'seats'])
      expect(named.get('plan')).toContain("`plan` is a module-scope signal() imported from './cart'")
      expect(named.get('monthly')).toContain('a module-scope computed()')
      expect(named.get('seats')).toMatch(/Declare the state in this \.tsx file .* or own it in one component and pass the value and a setter down as props/)
      expect(r.warnings.filter((w) => w.startsWith('`plan`'))).toHaveLength(1)
    })
  }

  // The warning's claim, checked: the emit really does not build. If a lowering lands, these flip and the warning
  // must go with them.
  it.skipIf(!isSwiftcAvailable())('swift: the emit it warns about does not typecheck (the warning is not a false alarm)', () => {
    const r = validateSwiftWithStubs(transform(p.source, { target: 'swift', filename: p.path }).code)
    expect(r.ok).toBe(false)
    expect(String(r.ok ? '' : r.error)).toMatch(/cannot find 'plan' in scope/)
  })
  it.skipIf(!isKotlincAvailable())('kotlin: the emit it warns about does not compile (the warning is not a false alarm)', () => {
    const r = validateKotlin(transform(p.source, { target: 'kotlin', filename: p.path }).code)
    expect(r.ok).toBe(false)
    expect(String(r.ok ? '' : r.error)).toMatch(/unresolved reference 'plan'/i)
  }, 180_000)
})

describe('every import shape resolves to the declaration it binds', () => {
  const cases: { name: string; files: Record<string, string>; expected: Record<string, RegExp> }[] = [
    {
      name: 'an aliased import names the local and the export',
      files: { 'App.tsx': app("import { plan as tier, seats as s, monthly as m } from './cart'", 'tier', 's', 'm'), 'cart.ts': CART },
      expected: { tier: /imported from '\.\/cart' \(as `plan`\)/, s: /\(as `seats`\)/, m: /computed\(\)/ },
    },
    {
      name: 'a default import of a named binding, and of an inline signal()',
      files: {
        'App.tsx': app("import plan from './plan'\nimport seats from './seats'\nimport { monthly } from './cart'"),
        'plan.ts': "import { signal } from '@pyreon/reactivity'\nconst plan = signal('free')\nexport default plan\n",
        'seats.ts': "import { signal } from '@pyreon/reactivity'\nexport default signal(1)\n",
        'cart.ts': CART,
      },
      expected: { plan: /the default export of '\.\/plan'/, seats: /the default export of '\.\/seats'/, monthly: /computed\(\)/ },
    },
    {
      name: 'a namespace import, read as ns.name',
      files: { 'App.tsx': app("import * as cart from './cart'", 'cart.plan', 'cart.seats', 'cart.monthly'), 'cart.ts': CART },
      expected: { 'cart.plan': /signal\(\)/, 'cart.seats': /signal\(\)/, 'cart.monthly': /computed\(\)/ },
    },
    {
      name: 'a barrel: named re-export, aliased re-export, export *, and an import it re-exports',
      files: {
        'App.tsx': app("import { plan, seatCount, monthly } from './state'", 'plan', 'seatCount'),
        'state/index.ts': "export { plan } from './cart'\nexport { seats as seatCount } from './cart'\nexport * from './more'\n",
        'state/more.ts': "import { monthly } from './cart'\nexport { monthly }\n",
        'state/cart.ts': CART,
      },
      expected: { plan: /imported from '\.\/state'/, seatCount: /signal\(\) imported from '\.\/state'/, monthly: /computed\(\)/ },
    },
    {
      name: 'a module exporting under another name, with the reactivity import aliased',
      files: {
        'App.tsx': app("import { plan, seats, monthly } from './cart'"),
        'cart.ts': "import { signal as sig, computed as derive } from '@pyreon/reactivity'\nconst p = sig('free')\nconst s = sig(1)\nexport const monthly = derive(() => s() * 12)\nexport { p as plan, s as seats }\n",
      },
      expected: { plan: /signal\(\)/, seats: /signal\(\)/, monthly: /computed\(\)/ },
    },
    {
      name: 'state declared in a sibling .tsx (compiled to its own singleton, still not readable from here)',
      files: { 'App.tsx': app("import { plan, seats, monthly } from './Cart'"), 'Cart.tsx': CART },
      expected: { plan: /'\.\/Cart'/, seats: /signal\(\)/, monthly: /computed\(\)/ },
    },
  ]
  for (const c of cases) {
    for (const target of both) {
      it(`${target}: ${c.name}`, () => {
        const p = project(c.files)
        const r = transform(p.source, { target, filename: p.path })
        const named = stateWarnings(r.warnings)
        expect([...named.keys()].sort(), r.warnings.join('\n')).toEqual(Object.keys(c.expected).sort())
        for (const [local, re] of Object.entries(c.expected)) expect(named.get(local)).toMatch(re)
      })
    }
  }
})

describe('a hook that carries the import in', () => {
  // `useTotal` lives in hooks.ts and reads `monthly` from './cart'; inlining it adds that import to the calling file,
  // and the state it brings is named just like one the file imported itself.
  const p = project({
    'App.tsx': `import { Text } from '@pyreon/primitives'
import { useTotal } from './hooks'
export function Total() {
  const total = useTotal()
  return <Text>{\`\${total} total\`}</Text>
}
`,
    'hooks.ts': "import { monthly } from './cart'\nexport function useTotal() {\n  return monthly() * 2\n}\n",
    'cart.ts': CART,
  })
  for (const target of both) {
    it(`${target}: names the carried state`, () => {
      const r = transform(p.source, { target, filename: p.path })
      expect([...stateWarnings(r.warnings).keys()], r.warnings.join('\n')).toEqual(['monthly'])
    })
  }
})

describe('what is NOT module state stays silent', () => {
  for (const target of both) {
    it(`${target}: an imported plain const, a helper function, a type and a component`, () => {
      const p = project({
        'App.tsx': `import { Stack, Text } from '@pyreon/primitives'
import { TAX, label } from './cart'
import type { Row } from './types'
import { Badge } from './Badge'
export function App() {
  const r: Row = { id: 1 }
  return (<Stack><Text>{label(TAX * r.id)}</Text><Badge /></Stack>)
}
`,
        'cart.ts': CART,
        'types.ts': 'export type Row = { id: number }\n',
        'Badge.tsx': "import { Text } from '@pyreon/primitives'\nexport function Badge() {\n  return <Text>b</Text>\n}\n",
      })
      expect([...stateWarnings(transform(p.source, { target, filename: p.path }).warnings).keys()]).toEqual([])
    })
    it(`${target}: an import NAMESPACE whose state is never read`, () => {
      const p = project({ 'App.tsx': app("import * as cart from './cart'\nimport { plan, seats, monthly } from './local'"), 'cart.ts': CART, 'local.ts': 'export const plan = 1\nexport const seats = 2\nexport const monthly = 3\n' })
      expect([...stateWarnings(transform(p.source, { target, filename: p.path }).warnings).keys()]).toEqual([])
    })
  }
})
