import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vercelRevalidateHandler } from '../vercel-revalidate-handler'

// M3.1 — Drop-in Vercel revalidate webhook handler.
//
// The handler validates request shape (POST + path + secret query), reads the
// build-time `_pyreon-revalidate.json` manifest, validates the path is in
// scope (closes "secret-leaks-once → revalidate-anything" footgun), and
// dispatches to a user-supplied `onRevalidate` callback or falls back to a
// success response.
//
// Bisect-load-bearing: revert any of (a) manifest path-validation, (b)
// secret check, (c) method check → the corresponding spec fails.

const VALID_SECRET = 'super-secret-token-123'

function makeManifestDir(manifest: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-vercel-rev-'))
  writeFileSync(join(dir, '_pyreon-revalidate.json'), JSON.stringify(manifest))
  return dir
}

describe('vercelRevalidateHandler (M3.1)', () => {
  let originalToken: string | undefined

  beforeEach(() => {
    originalToken = process.env.VERCEL_REVALIDATE_TOKEN
    process.env.VERCEL_REVALIDATE_TOKEN = VALID_SECRET
  })

  afterEach(() => {
    if (originalToken === undefined) delete process.env.VERCEL_REVALIDATE_TOKEN
    else process.env.VERCEL_REVALIDATE_TOKEN = originalToken
  })

  it('rejects non-POST methods with 405', async () => {
    const dir = makeManifestDir({ revalidate: { '/about': 60 } })
    try {
      const handler = vercelRevalidateHandler({ manifestPath: join(dir, '_pyreon-revalidate.json') })
      const res = await handler(
        new Request('http://localhost/api/_pyreon-revalidate?path=/about&secret=' + VALID_SECRET),
      )
      expect(res.status).toBe(405)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects missing path / secret with 400', async () => {
    const dir = makeManifestDir({ revalidate: { '/about': 60 } })
    try {
      const handler = vercelRevalidateHandler({ manifestPath: join(dir, '_pyreon-revalidate.json') })
      const res = await handler(
        new Request('http://localhost/api/_pyreon-revalidate', { method: 'POST' }),
      )
      expect(res.status).toBe(400)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns 500 when env-var secret is unset', async () => {
    const dir = makeManifestDir({ revalidate: { '/about': 60 } })
    delete process.env.VERCEL_REVALIDATE_TOKEN
    try {
      const handler = vercelRevalidateHandler({ manifestPath: join(dir, '_pyreon-revalidate.json') })
      const res = await handler(
        new Request(
          'http://localhost/api/_pyreon-revalidate?path=/about&secret=anything',
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(500)
      expect(await res.text()).toContain('VERCEL_REVALIDATE_TOKEN')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects wrong secret with 403', async () => {
    const dir = makeManifestDir({ revalidate: { '/about': 60 } })
    try {
      const handler = vercelRevalidateHandler({ manifestPath: join(dir, '_pyreon-revalidate.json') })
      const res = await handler(
        new Request(
          'http://localhost/api/_pyreon-revalidate?path=/about&secret=wrong',
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(403)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects path NOT in manifest with 404 (closes secret-leak-arbitrary-path footgun)', async () => {
    const dir = makeManifestDir({ revalidate: { '/about': 60, '/posts/1': 60 } })
    try {
      const handler = vercelRevalidateHandler({ manifestPath: join(dir, '_pyreon-revalidate.json') })
      const res = await handler(
        new Request(
          `http://localhost/api/_pyreon-revalidate?path=/admin/secrets&secret=${VALID_SECRET}`,
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('not in revalidate manifest')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('happy path: valid POST + secret + manifest path returns 200', async () => {
    const dir = makeManifestDir({ revalidate: { '/about': 60 } })
    try {
      const handler = vercelRevalidateHandler({ manifestPath: join(dir, '_pyreon-revalidate.json') })
      const res = await handler(
        new Request(
          `http://localhost/api/_pyreon-revalidate?path=/about&secret=${VALID_SECRET}`,
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { revalidated: boolean; path: string }
      expect(body).toEqual({ revalidated: true, path: '/about' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('invokes onRevalidate callback with validated path', async () => {
    const dir = makeManifestDir({ revalidate: { '/posts/42': 60 } })
    const calls: string[] = []
    try {
      const handler = vercelRevalidateHandler({
        manifestPath: join(dir, '_pyreon-revalidate.json'),
        onRevalidate: (path) => {
          calls.push(path)
        },
      })
      const res = await handler(
        new Request(
          `http://localhost/api/_pyreon-revalidate?path=/posts/42&secret=${VALID_SECRET}`,
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(200)
      expect(calls).toEqual(['/posts/42'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns 500 when onRevalidate throws', async () => {
    const dir = makeManifestDir({ revalidate: { '/about': 60 } })
    try {
      const handler = vercelRevalidateHandler({
        manifestPath: join(dir, '_pyreon-revalidate.json'),
        onRevalidate: () => {
          throw new Error('upstream cache invalidation failed')
        },
      })
      const res = await handler(
        new Request(
          `http://localhost/api/_pyreon-revalidate?path=/about&secret=${VALID_SECRET}`,
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(500)
      expect(await res.text()).toContain('upstream cache invalidation failed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns 500 when manifest is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-vercel-rev-nomanifest-'))
    try {
      const handler = vercelRevalidateHandler({ manifestPath: join(dir, '_pyreon-revalidate.json') })
      const res = await handler(
        new Request(
          `http://localhost/api/_pyreon-revalidate?path=/about&secret=${VALID_SECRET}`,
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(500)
      expect(await res.text()).toContain('unreadable or malformed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns 500 when manifest is malformed JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-vercel-rev-malformed-'))
    writeFileSync(join(dir, '_pyreon-revalidate.json'), 'not valid json {')
    try {
      const handler = vercelRevalidateHandler({ manifestPath: join(dir, '_pyreon-revalidate.json') })
      const res = await handler(
        new Request(
          `http://localhost/api/_pyreon-revalidate?path=/about&secret=${VALID_SECRET}`,
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(500)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns 500 when manifest lacks `revalidate` field', async () => {
    const dir = makeManifestDir({ notRevalidate: { '/about': 60 } })
    try {
      const handler = vercelRevalidateHandler({ manifestPath: join(dir, '_pyreon-revalidate.json') })
      const res = await handler(
        new Request(
          `http://localhost/api/_pyreon-revalidate?path=/about&secret=${VALID_SECRET}`,
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(500)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('honors custom secretEnvVar option', async () => {
    const dir = makeManifestDir({ revalidate: { '/about': 60 } })
    delete process.env.VERCEL_REVALIDATE_TOKEN
    process.env.MY_CUSTOM_SECRET = 'custom-secret-456'
    try {
      const handler = vercelRevalidateHandler({
        manifestPath: join(dir, '_pyreon-revalidate.json'),
        secretEnvVar: 'MY_CUSTOM_SECRET',
      })
      const res = await handler(
        new Request(
          `http://localhost/api/_pyreon-revalidate?path=/about&secret=custom-secret-456`,
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(200)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      delete process.env.MY_CUSTOM_SECRET
    }
  })

  it('honors custom manifestPath option', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-vercel-rev-custompath-'))
    writeFileSync(
      join(dir, 'my-custom-manifest.json'),
      JSON.stringify({ revalidate: { '/about': 60 } }),
    )
    try {
      // Absolute path — test the option resolves both cwd-relative AND
      // absolute paths.
      const handler = vercelRevalidateHandler({
        manifestPath: join(dir, 'my-custom-manifest.json'),
      })
      const res = await handler(
        new Request(
          `http://localhost/api/_pyreon-revalidate?path=/about&secret=${VALID_SECRET}`,
          { method: 'POST' },
        ),
      )
      expect(res.status).toBe(200)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
