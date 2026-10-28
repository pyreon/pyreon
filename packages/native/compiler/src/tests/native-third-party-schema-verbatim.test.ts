// A bare `z.object({…})` outside a Pyreon adapter was re-emitted VERBATIM — `private let User = z.object((name: …))` — which
// neither swiftc nor kotlinc accepts, with ZERO warnings from this compiler. PMTC reads zod / valibot / arktype only
// through `zodSchema(…)` / `valibotSchema(…)` / `arktypeSchema(…)` from `@pyreon/validation` (or the first-party `s`
// from `@pyreon/validate`), so a schema-library import that survives into the emitted file is now reported BY NAME,
// judged by survival exactly like an unlowered Pyreon export: an import an adapter consumed never gets here.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

const BARE = `import { z } from 'zod'
import { Stack, Text } from '@pyreon/primitives'
const User = z.object({ name: z.string().min(2), age: z.number() })
export function App() {
  const r = User.safeParse({ name: 'a', age: 3 })
  return (<Stack><Text>{r.success ? 'ok' : 'bad'}</Text></Stack>)
}`

const ADAPTED = `import { z } from 'zod'
import { zodSchema } from '@pyreon/validation'
import { Stack, Text } from '@pyreon/primitives'
const User = zodSchema(z.object({ name: z.string().min(2), age: z.number() }))
export function App() { return (<Stack><Text>ok</Text></Stack>) }`

const NAMESPACE = `import * as v from 'valibot'
import { Stack, Text } from '@pyreon/primitives'
const User = v.object({ name: v.string() })
export function App() { return (<Stack><Text>ok</Text></Stack>) }`

const FIRST_PARTY = `import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
const User = s.object({ name: s.string().min(2), age: s.number() })
export function App() {
  const r = User.safeParse({ name: 'a', age: 3 })
  return (<Stack><Text>{r.success ? 'ok' : 'bad'}</Text></Stack>)
}`

describe('a schema-library import that survives verbatim is reported by name', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: a bare z.object(…) names zod and the adapter that would lower it`, () => {
      const w = transform(BARE, { target }).warnings
      const hit = w.find((x) => x.startsWith('z (from zod)'))
      expect(hit, JSON.stringify(w)).toBeDefined()
      expect(hit).toContain('zodSchema')
      expect(hit).toContain('@pyreon/validate')
    })

    it(`${target}: a schema an adapter consumed draws NO survival warning`, () => {
      const w = transform(ADAPTED, { target }).warnings
      expect(w.some((x) => x.includes('(from zod)'))).toBe(false)
    })

    it(`${target}: the first-party s schema is untouched`, () => {
      expect(transform(FIRST_PARTY, { target }).warnings).toEqual([])
    })

    it(`${target}: a namespace import (import * as v) is judged by the namespace`, () => {
      const w = transform(NAMESPACE, { target }).warnings
      expect(w.some((x) => x.startsWith('v (from valibot)'))).toBe(true)
    })
  }

  it('a type-only import of the library is not a survivor', () => {
    const src = `import type { z } from 'zod'
import { Stack, Text } from '@pyreon/primitives'
export function App() { return (<Stack><Text>ok</Text></Stack>) }`
    expect(transform(src, { target: 'swift' }).warnings.some((x) => x.includes('(from zod)'))).toBe(false)
  })
})
