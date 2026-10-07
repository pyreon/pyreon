import { s } from '@pyreon/validate'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
const Links = s.object({ home: s.string().url(), proto: s.string().url({ protocol: /^https?$/ }), bad: s.string().url({ protocol: someRe }), spread: s.string().url({ ...opts }), objVar: s.string().url(optsVar) })
const Z = zodSchema(z.object({ site: z.string().url(), email: z.string().email(), id: z.string().uuid(), slug: z.string().regex(/^[a-z]+$/i) }))
const Re = s.object({ a: s.string().regex(/^a/g), b: s.string().regex(/(?<=x)y/), c: s.string().regex(notLiteral), d: s.string().regex(/a"#/), e: s.string().regex(/^ok$/i) })
