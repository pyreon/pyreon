import { zodSchema } from '@pyreon/validation'
import { s } from '@pyreon/validate'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { model } from '../model'

// Strict-typing regression lock. `model({ schema })` must infer the instance
// state STRICTLY from the schema — for ALL three schema shapes:
//   1. `@pyreon/validate` `s.object` ("our one") — direct, no wrapper
//   2. a raw `z.object` (Standard Schema via `~standard`) — direct, no wrapper
//   3. the `@pyreon/validation` `zodSchema(...)` adapter (the `_infer` path)
//
// The assertions are TYPE-LEVEL (the `const x: string = …` lines fail to COMPILE
// if the field falls back to untyped `unknown`/`StateShape`). The package's
// `tsc --noEmit` typecheck is the real gate; the runtime `expect`s keep the
// specs honest in the test runner too. Before the `InferSchemaState` change,
// arms 1 + 2 inferred `StateShape` and these `: string` / `: number`
// assignments errored — the bug this file locks shut.

describe('model({ schema }) — strict typing from the schema', () => {
  it('infers strictly from a @pyreon/validate s.object (our own validator)', () => {
    const User = model({
      schema: s.object({ name: s.string(), age: s.number() }),
      initial: { name: '', age: 0 },
    })
    const u = User.create({ name: 'Ada', age: 36 })
    const name: string = u.name()
    const age: number = u.age()
    expect(name).toBe('Ada')
    expect(age).toBe(36)
  })

  it('infers strictly from a raw z.object (Standard Schema, no adapter wrapper)', () => {
    const User = model({
      schema: z.object({ name: z.string(), age: z.number() }),
      initial: { name: '', age: 0 },
    })
    const u = User.create({ name: 'Lin', age: 41 })
    const name: string = u.name()
    const age: number = u.age()
    expect(name).toBe('Lin')
    expect(age).toBe(41)
  })

  it('infers strictly via the zodSchema() adapter (the _infer path)', () => {
    const User = model({
      schema: zodSchema(z.object({ name: z.string(), age: z.number() })),
      initial: { name: '', age: 0 },
    })
    const u = User.create({ name: 'Bo', age: 22 })
    const name: string = u.name()
    const age: number = u.age()
    expect(name).toBe('Bo')
    expect(age).toBe(22)
  })

  it('nested object fields keep their strict shape', () => {
    const Settings = model({
      schema: s.object({
        theme: s.string(),
        prefs: s.object({ density: s.string(), compact: s.boolean() }),
      }),
      initial: { theme: 'light', prefs: { density: 'cozy', compact: false } },
    })
    const cfg = Settings.create()
    const theme: string = cfg.theme()
    const prefs: { density: string; compact: boolean } = cfg.prefs()
    expect(theme).toBe('light')
    expect(prefs.density).toBe('cozy')
  })
})
