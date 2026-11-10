#!/usr/bin/env bun
/**
 * Email GRAMMAR corpus — which addresses each library's email check accepts.
 *
 * The protocol bench's `string.email` cells time each library's own `email`
 * check, and those checks are NOT the same grammar, so the cells compare
 * different work. This prints, for a fixed accept/reject corpus, every
 * library's verdict next to Pyreon's, so a reader can see where each grammar
 * is looser or stricter before reading a speed ratio.
 *
 * Grammars as shipped (read from each package's built output, 2026-11-10):
 *  - arktype 2.2.9 `string.email`: `/^[\w%+.-]+@[\d.A-Za-z-]+\.[A-Za-z]{2,}$/`
 *    — no dot rules at all in the local part or domain.
 *  - typia 15.2.1 `format: email`: dot-atom local part of RFC 5322 atext,
 *    domain of ≥2 alphanumeric labels with interior hyphens; the TLD may be
 *    digits or one character.
 *  - zod / valibot: their own `email()` regexes.
 *  - Pyreon `standard`: no leading/consecutive dots, last local char not `'`,
 *    labels start alphanumeric, alpha TLD of ≥2.
 *
 * Run: bun bench/email-grammar-corpus.ts
 */
import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'
import * as typiaGen from './typia/generated.js'
import { s } from '../src/index'

const corpus = [
  'ada@example.com', 'a.b@x.co', 'a+tag@x.io', "o'neil@x.com", 'a_b@x-y.com',
  'a..b@x.com', '.a@x.com', 'a.@x.com', 'a@x..com', 'a@-x.com', 'a@x-.com',
  'a@x.c', 'a@x.c1', 'a@x.123', 'a@x', 'a!b@x.com', 'a%b@x.com', 'a/b@x.com',
  'a b@x.com', 'a@x_y.com', 'ä@x.com', '@x.com', 'a@', 'a@@x.com',
]
const libs: Record<string, (x: string) => boolean> = {
  pyreon: (x) => s.string().email().is(x),
  zod: (x) => z.string().email().safeParse(x).success,
  valibot: (x) => v.is(v.pipe(v.string(), v.email()), x),
  arktype: (x) => type('string.email').allows(x),
  typia: (x) => typiaGen.isStringEmail(x),
}
const names = Object.keys(libs)
console.log(`${'input'.padEnd(14)} ${names.map((n) => n.padEnd(8)).join('')}`)
const diff: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]))
for (const x of corpus) {
  const p = libs.pyreon!(x)
  const row = names.map((n) => {
    const ok = libs[n]!(x)
    if (ok !== p) diff[n]!++
    return (ok ? 'accept' : '·').padEnd(8)
  })
  console.log(`${JSON.stringify(x).padEnd(14)} ${row.join('')}`)
}
console.log(`\ndisagreements with Pyreon over ${corpus.length} inputs: ${names.filter((n) => n !== 'pyreon').map((n) => `${n} ${diff[n]}`).join(' · ')}`)
