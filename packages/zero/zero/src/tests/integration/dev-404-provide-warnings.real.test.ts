/**
 * Real dev-server reproduction across all 3 modes (ssr / ssg / spa).
 * The user's app is in 'ssg' mode (per their evidence: "The same component
 * tree rendered by the SSG build pipeline → 0 warnings").
 *
 * Middleware chain differs per mode:
 *   - mode: 'ssr' → upstream SSR middleware tries renderSsr first;
 *                   on null, falls through to handle404 which retries renderSsr.
 *   - mode: 'ssg' → NO upstream SSR middleware; handle404 is the only render path.
 *   - mode: 'spa' → same as 'ssg' for the dev-404 path.
 */
import { resolve } from 'node:path'
import pyreon from '@pyreon/vite-plugin'
import { createServer, type ViteDevServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { zeroPlugin } from '../../vite-plugin'

const FIXTURE_DIR = resolve(import.meta.dirname, 'fixture-provide-warnings')

const aliasConfig = {
  conditions: ['bun'],
  alias: {
    '@pyreon/ui-core': resolve(
      import.meta.dirname,
      '../../../../../ui-system/ui-core/src/index.ts',
    ),
    '@pyreon/styler': resolve(import.meta.dirname, '../../../../../ui-system/styler/src/index.ts'),
    '@pyreon/unistyle': resolve(
      import.meta.dirname,
      '../../../../../ui-system/unistyle/src/index.ts',
    ),
    '@pyreon/elements': resolve(
      import.meta.dirname,
      '../../../../../ui-system/elements/src/index.ts',
    ),
  },
}

const optimizeDepsExclude = [
  '@pyreon/core',
  '@pyreon/reactivity',
  '@pyreon/router',
  '@pyreon/runtime-dom',
  '@pyreon/runtime-server',
  '@pyreon/head',
  '@pyreon/server',
  '@pyreon/ui-core',
  '@pyreon/styler',
  '@pyreon/unistyle',
  '@pyreon/elements',
  '@pyreon/vite-plugin',
]

interface ProbeResult {
  mode: string
  status: number
  pageNotFound: boolean
  siteTitle: boolean
  provideWarnings: number
  effectErrors: number
  cannotDestructure: number
  fullWarnings: string[]
}

async function probeMode(mode: 'ssr' | 'ssg' | 'spa'): Promise<ProbeResult> {
  let server: ViteDevServer | undefined
  const stderrBuffer: string[] = []
  const origStderrWrite = process.stderr.write.bind(process.stderr)
  ;(process.stderr.write as unknown as (chunk: string | Uint8Array) => boolean) = (chunk) => {
    const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    stderrBuffer.push(text)
    return origStderrWrite(chunk)
  }

  try {
    server = await createServer({
      root: FIXTURE_DIR,
      configFile: false,
      plugins: [pyreon(), zeroPlugin({ mode })],
      resolve: aliasConfig,
      ssr: { resolve: { conditions: ['bun'] } },
      optimizeDeps: { exclude: optimizeDepsExclude },
      server: { port: 0 },
      logLevel: 'info',
    })
    await server.listen()
    const address = server.httpServer?.address()
    const baseUrl = address && typeof address === 'object' ? `http://localhost:${address.port}` : ''

    // Warm up so stderr isn't polluted by cold-start Vite chatter.
    await fetch(`${baseUrl}/`)
      .then((r) => r.text())
      .catch(() => '')
    stderrBuffer.length = 0

    const res = await fetch(`${baseUrl}/this-route-does-not-exist`)
    const html = await res.text()

    const captured = stderrBuffer.join('')
    const provideWarnings =
      captured.match(/\[Pyreon\] [a-zA-Z]+\(\) called outside component setup/g) || []
    const effectErrors = captured.match(/Unhandled effect error/g) || []
    const cannotDestructure = captured.match(/Cannot destructure property/g) || []
    const fullWarnings = captured
      .split('\n')
      .filter(
        (l) =>
          l.includes('called outside component setup') ||
          l.includes('Unhandled effect error') ||
          l.includes('Cannot destructure'),
      )
      .slice(0, 5)

    return {
      mode,
      status: res.status,
      pageNotFound: html.includes('Page Not Found'),
      siteTitle: html.includes('Site title'),
      provideWarnings: provideWarnings.length,
      effectErrors: effectErrors.length,
      cannotDestructure: cannotDestructure.length,
      fullWarnings,
    }
  } finally {
    await server?.close()
    process.stderr.write = origStderrWrite
  }
}

function assertClean(r: ProbeResult): void {
  // Lock the contract: dev-404 SSR synthetic-chain render path must NOT
  // emit ANY of these. Each corresponds to a real bug class the framework
  // has shipped before (#725 ctx-stack, #837 enrichTheme, #839 slot reactivity).
  process.stderr.write(
    `\n[${r.mode}] status=${r.status} pageNotFound=${r.pageNotFound} siteTitle=${r.siteTitle} ` +
      `provideWarnings=${r.provideWarnings} effectErrors=${r.effectErrors} cannotDestructure=${r.cannotDestructure}\n`,
  )
  for (const w of r.fullWarnings) process.stderr.write(`  ${w.slice(0, 140)}\n`)
  expect(r.status, `${r.mode}: should respond with 404`).toBe(404)
  expect(r.pageNotFound, `${r.mode}: should render the user's _404.tsx`).toBe(true)
  expect(r.siteTitle, `${r.mode}: should wrap the 404 in the layout chrome`).toBe(true)
  expect(
    r.provideWarnings,
    `${r.mode}: dev-404 must NOT emit provide() outside setup warnings`,
  ).toBe(0)
  expect(r.effectErrors, `${r.mode}: dev-404 must NOT emit Unhandled effect error`).toBe(0)
  expect(r.cannotDestructure, `${r.mode}: dev-404 must NOT trigger Cannot destructure errors`).toBe(
    0,
  )
}

describe('dev-404 — provide() warning storm regression lock (all modes)', () => {
  it('mode: ssr — synthetic chain renders cleanly through upstream + handle404 fallback', async () => {
    assertClean(await probeMode('ssr'))
  }, 60_000)

  it("mode: ssg — handle404 is the only render path (user's reported mode)", async () => {
    assertClean(await probeMode('ssg'))
  }, 60_000)

  it('mode: spa — handle404 fallback parity with ssg', async () => {
    assertClean(await probeMode('spa'))
  }, 60_000)
})
