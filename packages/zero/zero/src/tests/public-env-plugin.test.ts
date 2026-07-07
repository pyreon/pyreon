/**
 * The plugin-side security boundary: `loadPublicEnvVars` must read ONLY
 * `ZERO_PUBLIC_*` vars from `.env*` (+ shell env) and strip the prefix — a
 * secret without the prefix can NEVER reach the client bundle. This is the
 * load-bearing safety property of the whole feature.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPublicEnvVars } from '../public-env'

describe('loadPublicEnvVars — the ZERO_PUBLIC_ security boundary', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zero-env-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads ZERO_PUBLIC_* from .env, strips the prefix, EXCLUDES secrets', () => {
    writeFileSync(
      join(dir, '.env'),
      [
        'ZERO_PUBLIC_API_URL=https://api.example.com',
        'ZERO_PUBLIC_APP_NAME=MyApp',
        'DATABASE_URL=postgres://user:secret@host/db', // secret — must NOT leak
        'STRIPE_SECRET_KEY=sk_live_xxx', // secret — must NOT leak
      ].join('\n'),
    )

    const vars = loadPublicEnvVars('production', dir)

    expect(vars).toEqual({
      API_URL: 'https://api.example.com',
      APP_NAME: 'MyApp',
    })
    // The security guarantee: no secret, in any key form, is present.
    const serialized = JSON.stringify(vars)
    expect(serialized).not.toContain('DATABASE_URL')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('STRIPE')
    expect(serialized).not.toContain('sk_live')
  })

  it('layers .env.<mode> over .env (Vite cascade)', () => {
    writeFileSync(join(dir, '.env'), 'ZERO_PUBLIC_API_URL=https://default')
    writeFileSync(join(dir, '.env.production'), 'ZERO_PUBLIC_API_URL=https://prod')
    expect(loadPublicEnvVars('production', dir).API_URL).toBe('https://prod')
  })

  it('returns an empty object when no public vars are set', () => {
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgres://secret')
    expect(loadPublicEnvVars('production', dir)).toEqual({})
  })
})
