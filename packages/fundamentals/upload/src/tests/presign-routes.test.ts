import { describe, expect, it } from 'vitest'
import { createPresignRoutes, objectKey, type S3Ops } from './reference-presign'

const calls: string[] = []

const ops: S3Ops = {
  createMultipartUpload: async (key) => { calls.push(`create ${key}`); return 'U1' },
  signPutObject: async (key) => `https://bucket.invalid/${key}?sig=1`,
  signUploadPart: async (key, id, n) => `https://bucket.invalid/${key}?uploadId=${id}&partNumber=${n}&sig=1`,
  completeMultipartUpload: async (_k, _id, parts) => ({ size: parts.length }),
  abortMultipartUpload: async (key) => void calls.push(`abort ${key}`),
  listParts: async () => [{ partNumber: 1, etag: '"a"' }],
}

const ctx = (path: string, init?: RequestInit): { request: Request; url: URL } => ({ request: new Request(`http://x${path}`, init), url: new URL(`http://x${path}`) })

describe('the reference presign routes', () => {
  it('the server chooses the key: the client file name never reaches it', () => {
    for (const name of ['../../etc/passwd.png', 'a/b\\c.JPG', '‮exe.png', '', 'noext', 'x.tar.gz', `${'a'.repeat(300)}.png`, 'photo.p-n-g']) {
      const key = objectKey('u1', name)

      expect(key, name).toMatch(/^uploads\/u1\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/)
    }
    expect(objectKey('u1', '../../x.PNG')).toMatch(/\.png$/)
    expect(objectKey('u1', 'a')).not.toContain('.')
    expect(objectKey('u1', 'a')).not.toBe(objectKey('u1', 'a'))
  })

  it('answers what s3Transport expects: single, create, sign part, list, complete, abort', async () => {
    const routes = createPresignRoutes(ops, () => 'u1')
    const single = (await (await routes.sign!(ctx('/x?name=a.png'))).json()) as { url: string; method: string }

    expect(single.method).toBe('PUT')
    expect(single.url).toMatch(/^https:\/\/bucket\.invalid\/uploads\/u1\/.+\.png\?sig=1$/)
    const created = (await (await routes.create!(ctx('/x?name=big.mp4'))).json()) as { uploadId: string }

    expect(created.uploadId).toBe('U1')
    const part = (await (await routes.signPart!(ctx('/x?uploadId=U1&partNumber=3'))).json()) as { url: string }

    expect(part.url).toContain('partNumber=3')
    expect(await (await routes.list!(ctx('/x?uploadId=U1'))).json()).toEqual([{ partNumber: 1, etag: '"a"' }])
    const done = await routes.complete!(ctx('/x?uploadId=U1', { method: 'POST', body: JSON.stringify({ parts: [{ partNumber: 1, etag: '"a"' }] }) }))

    expect(await done.json()).toMatchObject({ size: 1 })
    expect(calls[0]).toMatch(/^create uploads\/u1\//)
  })

  it('refuses unknown uploads, bad part numbers and empty completions; abort forgets the upload', async () => {
    const routes = createPresignRoutes(ops, () => 'u1')

    expect((await routes.signPart!(ctx('/x?uploadId=nope&partNumber=1'))).status).toBe(400)
    await routes.create!(ctx('/x?name=a.mp4'))
    for (const n of ['0', '10001', '1.5', 'x', '-1']) expect((await routes.signPart!(ctx(`/x?uploadId=U1&partNumber=${n}`))).status, n).toBe(400)
    expect((await routes.complete!(ctx('/x?uploadId=U1', { method: 'POST', body: JSON.stringify({ parts: [] }) }))).status).toBe(400)
    expect((await routes.abort!(ctx('/x?uploadId=U1', { method: 'DELETE' }))).status).toBe(204)
    expect((await routes.abort!(ctx('/x?uploadId=U1', { method: 'DELETE' }))).status).toBe(404)
    expect((await routes.list!(ctx('/x?uploadId=U1'))).status).toBe(404)
  })
})
