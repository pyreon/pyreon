// The presign routes for `s3Transport`, as shown in the docs (the docs test checks the page shows this code).
// `ops` is where the AWS SDK goes (see the docs); the routes only decide the object key, validate the input and shape the answers.

export interface S3Ops {
  createMultipartUpload(key: string): Promise<string>
  signPutObject(key: string): Promise<string>
  signUploadPart(key: string, uploadId: string, partNumber: number): Promise<string>
  completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<{ size: number }>
  abortMultipartUpload(key: string, uploadId: string): Promise<void>
  listParts(key: string, uploadId: string): Promise<{ partNumber: number; etag: string }[]>
}

interface ApiContext {
  request: Request
  url: URL
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * The server chooses the key: never the file name from the client (it may hold `../`, control characters or a name that
 * overwrites another user's file). Keep the extension only when it is plain.
 */
export function objectKey(userId: string, fileName: string): string {
  const ext = /\.[a-z0-9]{1,8}$/i.exec(fileName)?.[0]?.toLowerCase() ?? ''

  return `uploads/${userId}/${crypto.randomUUID()}${ext}`
}

/** `POST /api/s3/create?name=` and the routes that follow it. `keyOf` maps an upload id back to the key it was created with. */
export function createPresignRoutes(ops: S3Ops, userId: () => string): Record<string, (ctx: ApiContext) => Promise<Response>> {
  const keys = new Map<string, string>()
  const keyFor = (uploadId: string | null): string | undefined => (uploadId === null ? undefined : keys.get(uploadId))

  return {
    async sign({ url }) {
      const key = objectKey(userId(), url.searchParams.get('name') ?? '')

      return json({ url: await ops.signPutObject(key), method: 'PUT' })
    },
    async create({ url }) {
      const key = objectKey(userId(), url.searchParams.get('name') ?? '')
      const uploadId = await ops.createMultipartUpload(key)

      keys.set(uploadId, key)

      return json({ uploadId })
    },
    async signPart({ url }) {
      const key = keyFor(url.searchParams.get('uploadId'))
      const partNumber = Number(url.searchParams.get('partNumber'))

      if (key === undefined || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) return json({ error: 'bad request' }, 400)

      return json({ url: await ops.signUploadPart(key, url.searchParams.get('uploadId')!, partNumber) })
    },
    async complete({ request, url }) {
      const key = keyFor(url.searchParams.get('uploadId'))
      const body = (await request.json()) as { parts?: { partNumber: number; etag: string }[] }

      if (key === undefined || !Array.isArray(body.parts) || body.parts.length === 0) return json({ error: 'bad request' }, 400)
      const result = await ops.completeMultipartUpload(key, url.searchParams.get('uploadId')!, body.parts)

      keys.delete(url.searchParams.get('uploadId')!)

      return json({ key, ...result })
    },
    async abort({ url }) {
      const key = keyFor(url.searchParams.get('uploadId'))

      if (key === undefined) return json({ error: 'unknown upload' }, 404)
      await ops.abortMultipartUpload(key, url.searchParams.get('uploadId')!)
      keys.delete(url.searchParams.get('uploadId')!)

      return new Response(null, { status: 204 })
    },
    async list({ url }) {
      const key = keyFor(url.searchParams.get('uploadId'))

      return key === undefined ? json({ error: 'unknown upload' }, 404) : json(await ops.listParts(key, url.searchParams.get('uploadId')!))
    },
  }
}
