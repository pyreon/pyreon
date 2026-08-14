/**
 * `https()` against a REAL Vite dev server.
 *
 * The unit half lives in `https-cert.test.ts`. This file exists because the
 * things most likely to break are integration facts that no unit test can
 * reach: whether Vite actually applies the certificate, and whether a plugin's
 * `config()` can override the inline `server` block that `zero dev` passes.
 * That second one is the Vite merge-order trap this repo has been bitten by
 * before (#1395, where a plugin's `config()` return beat an inline `build()`
 * argument), so it is asserted rather than assumed.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from 'node:tls'
import { afterAll, describe, expect, it } from 'vitest'
import { createServer } from 'vite'

import { resolveCertificate } from '../https/cert'
import { https } from '../https'
import { createSelfSignedCert } from '../https/selfsign'

const roots: string[] = []
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-https-'))
  roots.push(root)
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>t</title>')
  return root
}

describe('https() on a real dev server', () => {
  it('serves TLS, and `lan: true` binds the host even against an inline host:false', async () => {
    const root = makeRoot()
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [https({ lan: true, selfSigned: true, quiet: true })],
      // EXACTLY the shape `zero dev` passes. If a plugin's `config()` could not
      // override it, `lan: true` would certify an address the server never
      // binds to — a certificate for something unreachable.
      server: { port: 0, host: false },
    })
    try {
      await server.listen()
      expect(server.config.server.https).toBeTruthy()
      expect(server.config.server.host).toBe(true)

      // Non-null rather than optional chaining: `listen()` resolved above, so
      // an absent httpServer is a broken invariant that should fail loudly.
      const { port } = server.httpServer!.address() as AddressInfo
      const ok = await new Promise<boolean>((resolve) => {
        const socket = connect({ host: '127.0.0.1', port, servername: 'localhost', rejectUnauthorized: false }, () => {
          socket.end()
          resolve(true)
        })
        socket.on('error', () => resolve(false))
      })
      expect(ok).toBe(true)
    } finally {
      await server.close()
    }
  }, 60_000)

  it('leaves the host alone when `lan` is not requested', async () => {
    const root = makeRoot()
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [https({ selfSigned: true, quiet: true })],
      server: { port: 0, host: false },
    })
    try {
      await server.listen()
      expect(server.config.server.https).toBeTruthy()
      // Binding every interface is a real exposure decision; without `lan` the
      // plugin must not make it for you.
      expect(server.config.server.host).toBe(false)
    } finally {
      await server.close()
    }
  }, 60_000)

  it('covers `preview` too, which the docs promise and nothing else asserted', async () => {
    // `vite preview` resolves its config with `command: 'serve'`, so the
    // build-time early return does not skip it — worth pinning, because if
    // that ever became `'build'` the preview server would silently fall back
    // to plain HTTP while the documentation still claimed TLS.
    const { preview } = await import('vite')
    const root = makeRoot()
    mkdirSync(join(root, 'dist'), { recursive: true })
    writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html><title>t</title>')

    const server = await preview({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [https({ selfSigned: true, quiet: true })],
      preview: { port: 0 },
    })
    try {
      expect(server.config.preview.https).toBeTruthy()
      // The URL Vite prints is the user-visible promise.
      expect(server.resolvedUrls?.local?.[0]).toMatch(/^https:/)
    } finally {
      await server.close()
    }
  }, 60_000)

  it('does nothing during a build — a certificate in CI is pure waste', () => {
    const plugin = https({ selfSigned: true })
    const config = plugin.config as (c: object, e: { command: string; mode: string }) => unknown
    expect(config.call(plugin, {}, { command: 'build', mode: 'production' })).toBeUndefined()
  })
})

describe('certificate resolution', () => {
  it('reuses the cached certificate for the same hosts', () => {
    const root = makeRoot()
    const first = resolveCertificate({ hosts: ['localhost'], root, preferSelfSigned: true })
    const second = resolveCertificate({ hosts: ['localhost'], root, preferSelfSigned: true })
    expect(second.cert).toBe(first.cert)
  })

  it('REISSUES when the host list changes, instead of serving one that no longer matches', () => {
    // The failure this prevents is the nasty one: a cached certificate loads
    // fine and then fails to match the new address, which surfaces as an
    // opaque browser error rather than as a stale cache.
    const root = makeRoot()
    const first = resolveCertificate({ hosts: ['localhost'], root, preferSelfSigned: true })
    const second = resolveCertificate({ hosts: ['localhost', '192.168.1.24'], root, preferSelfSigned: true })
    expect(second.cert).not.toBe(first.cert)
    expect(second.hosts).toContain('192.168.1.24')
  })

  it('keeps the private key owner-only', () => {
    const root = makeRoot()
    resolveCertificate({ hosts: ['localhost'], root, preferSelfSigned: true })
    const mode = statSync(join(root, 'node_modules', '.pyreon-https', 'key.pem')).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('git-ignores its own cache directory', () => {
    const root = makeRoot()
    resolveCertificate({ hosts: ['localhost'], root, preferSelfSigned: true })
    expect(readFileSync(join(root, 'node_modules', '.pyreon-https', '.gitignore'), 'utf8')).toContain('*')
  })

  it('survives a corrupt cache by regenerating rather than throwing', () => {
    const root = makeRoot()
    resolveCertificate({ hosts: ['localhost'], root, preferSelfSigned: true })
    writeFileSync(join(root, 'node_modules', '.pyreon-https', 'meta.json'), 'not json{')
    const recovered = resolveCertificate({ hosts: ['localhost'], root, preferSelfSigned: true })
    expect(recovered.cert).toContain('BEGIN CERTIFICATE')
  })

  it('uses a supplied certificate verbatim, and demands both halves', () => {
    const root = makeRoot()
    const material = createSelfSignedCert({ hosts: ['byo.localhost'] })
    const certFile = join(root, 'c.pem')
    const keyFile = join(root, 'k.pem')
    writeFileSync(certFile, material.cert)
    writeFileSync(keyFile, material.key)

    const resolved = resolveCertificate({ hosts: ['byo.localhost'], root, certFile, keyFile })
    expect(resolved.tier).toBe('provided')
    expect(resolved.cert).toBe(material.cert)

    expect(() => resolveCertificate({ hosts: ['x'], root, certFile })).toThrow(/both must be given/)
    expect(() =>
      resolveCertificate({ hosts: ['x'], root, certFile: join(root, 'nope.pem'), keyFile }),
    ).toThrow(/cert file not found/)
  })
})
