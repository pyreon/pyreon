/**
 * The `dashboard` template's generated auth must be safe by default.
 *
 * The scaffold is a STARTING POINT, not an auth system -- but what it ships is
 * what a deployed app runs until someone replaces it. It used to seed a known
 * login (`demo@example.com` / `demo1234`) in every build, store passwords in
 * plain text, mint session ids from `Math.random`, and write a non-HttpOnly
 * `sid` cookie from page JavaScript. These tests scaffold the template (no
 * integrations -- the in-memory stub) and drive the GENERATED endpoints with
 * real `Request`s.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { scaffold } from '../scaffold'
import type { ProjectConfig } from '../templates'

type Handler = (ctx: { request: Request }) => Promise<Response>
interface Endpoints {
  signin: Handler
  signup: Handler
  session: Handler
  signout: Handler
}

let dir = ''

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cz-dash-auth-'))
  const config: ProjectConfig = {
    name: 'dash-auth',
    targetDir: dir,
    template: 'dashboard',
    renderMode: 'ssr-stream',
    adapter: 'node',
    features: [],
    integrations: [],
    packageStrategy: 'individual',
    compat: 'none',
    aiTools: [],
    lint: false,
    typedRoutes: false,
  }
  await scaffold(config)
})

afterAll(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

/** Fresh module graph per call: `lib/auth.ts` keeps users and sessions in module state. */
async function endpoints(): Promise<Endpoints> {
  vi.resetModules()
  const load = async (name: string, method: 'GET' | 'POST'): Promise<Handler> => {
    const mod = (await import(/* @vite-ignore */ join(dir, `src/routes/api/${name}.ts`))) as Record<
      string,
      Handler
    >
    const fn = mod[method]
    if (!fn) throw new Error(`api/${name}.ts has no ${method} export`)
    return fn
  }
  return {
    signin: await load('signin', 'POST'),
    signup: await load('signup', 'POST'),
    session: await load('session', 'GET'),
    signout: await load('signout', 'POST'),
  }
}

function post(url: string, body: unknown, headers: Record<string, string> = {}): { request: Request } {
  return {
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  }
}

const sidOf = (setCookie: string | null): string => /^sid=([^;]*)/.exec(setCookie ?? '')?.[1] ?? ''

describe('dashboard template: generated auth', () => {
  it('sets the session cookie server-side: HttpOnly, SameSite=Lax, Secure off localhost', async () => {
    const api = await endpoints()
    const res = await api.signup(post('https://app.example.com/api/signup', { email: 'a@x.test', password: 'correct horse' }))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/; HttpOnly/)
    expect(cookie).toMatch(/; SameSite=Lax/)
    expect(cookie).toMatch(/; Secure/)
    // The id travels only in the cookie, never in a body page JS could read.
    expect(await res.text()).not.toContain(sidOf(cookie))

    const local = await api.signin(post('http://localhost:5173/api/signin', { email: 'a@x.test', password: 'correct horse' }))
    expect(local.headers.get('set-cookie')).toMatch(/; HttpOnly/)
    expect(local.headers.get('set-cookie')).not.toMatch(/Secure/)
  })

  it('mints 256-bit random session ids', async () => {
    const api = await endpoints()
    const creds = { email: 'b@x.test', password: 'correct horse' }
    const a = sidOf((await api.signup(post('https://app.example.com/api/signup', creds))).headers.get('set-cookie'))
    const b = sidOf((await api.signin(post('https://app.example.com/api/signin', creds))).headers.get('set-cookie'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it('stores a PBKDF2 hash, not the password', async () => {
    const api = await endpoints()
    const derive = vi.spyOn(crypto.subtle, 'deriveBits')
    try {
      await api.signup(post('https://app.example.com/api/signup', { email: 'c@x.test', password: 'correct horse' }))
      expect(derive).toHaveBeenCalled()
      const [params] = derive.mock.calls[0] as [Pbkdf2Params, ...unknown[]]
      expect(params.name).toBe('PBKDF2')
      expect(params.iterations).toBeGreaterThanOrEqual(600_000)
      // A wrong password is rejected, the right one accepted.
      expect((await api.signin(post('https://app.example.com/api/signin', { email: 'c@x.test', password: 'wrong horse' }))).status).toBe(401)
      expect((await api.signin(post('https://app.example.com/api/signin', { email: 'c@x.test', password: 'correct horse' }))).status).toBe(200)
    } finally {
      derive.mockRestore()
    }
  })

  it('seeds the demo account only in development', async () => {
    const demo = { email: 'demo@example.com', password: 'demo1234' }
    vi.stubEnv('DEV', false)
    try {
      const prod = await endpoints()
      expect((await prod.signin(post('https://app.example.com/api/signin', demo))).status).toBe(401)
    } finally {
      vi.unstubAllEnvs()
    }
    const dev = await endpoints()
    expect((await dev.signin(post('http://localhost:5173/api/signin', demo))).status).toBe(200)
  })

  it('resolves and ends a session through the endpoints only', async () => {
    const api = await endpoints()
    const sid = sidOf(
      (await api.signup(post('https://app.example.com/api/signup', { email: 'd@x.test', password: 'correct horse' }))).headers.get('set-cookie'),
    )
    const withCookie = (method: string) => ({
      request: new Request('https://app.example.com/api/x', { method, headers: { cookie: `sid=${sid}` } }),
    })
    expect(await (await api.session(withCookie('GET'))).json()).toEqual({ session: expect.objectContaining({ email: 'd@x.test' }) })

    const out = await api.signout(withCookie('POST'))
    expect(out.status).toBe(303)
    expect(out.headers.get('set-cookie')).toMatch(/^sid=; .*HttpOnly.*Max-Age=0/)
    expect(await (await api.session(withCookie('GET'))).json()).toEqual({ session: null })
  })

  it('refuses a non-JSON credential POST (a cross-site form needs no preflight)', async () => {
    const api = await endpoints()
    const form = new Request('https://app.example.com/api/signin', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=demo%40example.com&password=demo1234',
    })
    expect((await api.signin({ request: form })).status).toBe(415)
  })

  it('never imports the server-side auth module into a page, nor touches document.cookie', () => {
    const offenders: string[] = []
    const walk = (d: string): void => {
      for (const name of readdirSync(d)) {
        const p = join(d, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name)) {
          const rel = relative(dir, p)
          const src = readFileSync(p, 'utf8')
          const code = src
            .split('\n')
            .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
            .join('\n')
          if (code.includes('document.cookie')) offenders.push(`${rel}: document.cookie`)
          // A page may import TYPES from lib/auth; a value import bundles the
          // user table into the browser.
          const isPage = rel.startsWith('src/routes/') && !rel.startsWith('src/routes/api/')
          if (isPage && /^import\s+(?!type\b)[^\n]*from\s+["'][./]*lib\/auth["']/m.test(code)) {
            offenders.push(`${rel}: value import of lib/auth`)
          }
        }
      }
    }
    walk(join(dir, 'src'))
    expect(offenders).toEqual([])
  })
})
