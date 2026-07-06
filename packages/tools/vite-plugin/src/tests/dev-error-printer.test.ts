/**
 * Dev throw-time fix printer (Theme 6.1b).
 *
 * The plugin injects `virtual:pyreon/dev-error-printer` into index.html in DEV
 * only. The virtual module wires registerErrorHandler → diagnoseError.
 *
 * Bisect-verified: gating `transformIndexHtml` on `!isBuild` (dev-only) — a
 * build-mode injection would ship the compiler-diagnose import to production.
 */
import { describe, expect, it } from 'vitest'
import {
  DEV_ERROR_PRINTER_ID,
  DEV_ERROR_PRINTER_IMPORT,
  DEV_ERROR_PRINTER_SCRIPT_TAG,
  DEV_ERROR_PRINTER_SOURCE,
} from '../dev-error-printer'
import pyreonPlugin from '../index'

type ConfigHook = (
  userConfig: Record<string, unknown>,
  env: { command: string; isSsrBuild?: boolean },
) => Record<string, unknown>

function createPlugin(
  opts?: Parameters<typeof pyreonPlugin>[0],
  command: 'serve' | 'build' = 'serve',
) {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({}, { command })
  return plugin
}

function callTransformIndexHtml(plugin: ReturnType<typeof pyreonPlugin>, html: string) {
  const hook = plugin.transformIndexHtml as unknown as (html: string) => string | undefined
  return hook(html)
}

async function callResolveId(plugin: ReturnType<typeof pyreonPlugin>, id: string) {
  const hook = plugin.resolveId as unknown as (
    this: { resolve: () => Promise<null> },
    id: string,
    importer?: string,
  ) => Promise<string | undefined> | string | undefined
  return await hook.call({ resolve: async () => null }, id, undefined)
}

function callLoad(plugin: ReturnType<typeof pyreonPlugin>, id: string) {
  const hook = plugin.load as unknown as (id: string) => string | undefined
  return hook(id)
}

const HTML = '<!doctype html><html><head><title>x</title></head><body></body></html>'

describe('dev-error-printer constants', () => {
  it('the virtual module wires registerErrorHandler → diagnoseError', () => {
    expect(DEV_ERROR_PRINTER_SOURCE).toContain("import { registerErrorHandler } from '@pyreon/core'")
    expect(DEV_ERROR_PRINTER_SOURCE).toContain(
      "import { diagnoseError } from '@pyreon/compiler/diagnose'",
    )
    expect(DEV_ERROR_PRINTER_SOURCE).toContain('registerErrorHandler(')
    expect(DEV_ERROR_PRINTER_SOURCE).toContain('diagnoseError(')
    // Prints cause + fix + fixCode.
    expect(DEV_ERROR_PRINTER_SOURCE).toContain('d.cause')
    expect(DEV_ERROR_PRINTER_SOURCE).toContain('d.fix')
    expect(DEV_ERROR_PRINTER_SOURCE).toContain('d.fixCode')
    // Defensive: never throws back into the app.
    expect(DEV_ERROR_PRINTER_SOURCE).toMatch(/catch\s*\{/)
  })

  it('the script tag loads the virtual module by its /@id/ dev URL via src (NOT an inline import)', () => {
    // REGRESSION LOCK: a transformIndexHtml-injected INLINE `import 'virtual:…'`
    // is not import-analysed by Vite → the bare `virtual:` specifier reaches the
    // browser and CORS/scheme-errors (net::ERR_FAILED), breaking every dev app.
    // The `src`-based form makes the browser fetch the /@id/ URL, which Vite
    // serves with imports resolved. `\0` is URL-encoded as `__x00__`.
    expect(DEV_ERROR_PRINTER_SCRIPT_TAG).toBe(
      `<script type="module" src="/@id/${DEV_ERROR_PRINTER_ID.replace('\0', '__x00__')}"></script>`,
    )
    // Must be a SRC script, and must NOT be an inline `import 'virtual:…'`.
    expect(DEV_ERROR_PRINTER_SCRIPT_TAG).toContain('src="/@id/')
    expect(DEV_ERROR_PRINTER_SCRIPT_TAG).not.toContain(`import "${DEV_ERROR_PRINTER_IMPORT}"`)
    expect(DEV_ERROR_PRINTER_SCRIPT_TAG).not.toContain(`import '${DEV_ERROR_PRINTER_IMPORT}'`)
  })
})

describe('plugin wiring', () => {
  it('resolveId maps the virtual import to the \\0 id', async () => {
    const plugin = createPlugin()
    expect(await callResolveId(plugin, DEV_ERROR_PRINTER_IMPORT)).toBe(DEV_ERROR_PRINTER_ID)
  })

  it('load returns the bootstrap source for the \\0 id', () => {
    const plugin = createPlugin()
    expect(callLoad(plugin, DEV_ERROR_PRINTER_ID)).toBe(DEV_ERROR_PRINTER_SOURCE)
  })

  it('load returns undefined for an unrelated id', () => {
    const plugin = createPlugin()
    expect(callLoad(plugin, '\0some/other')).toBeUndefined()
  })

  it('resolves @pyreon/compiler/diagnose from the PLUGIN when the printer module imports it', async () => {
    // Apps rarely declare @pyreon/compiler (a build-tool dep), so a bare import
    // 500s ("Failed to resolve @pyreon/compiler/diagnose") in those apps. The
    // plugin resolves it from its own location instead. Regression lock.
    const plugin = createPlugin()
    const hook = plugin.resolveId as unknown as (
      this: {
        resolve: (
          id: string,
          importer?: string,
          opts?: { skipSelf: boolean },
        ) => Promise<{ id: string } | null>
      },
      id: string,
      importer?: string,
    ) => Promise<string | undefined>
    const calls: Array<{ id: string; skipSelf: boolean | undefined }> = []
    const out = await hook.call(
      {
        resolve: async (id, _importer, opts) => {
          calls.push({ id, skipSelf: opts?.skipSelf })
          return { id: '/abs/compiler/lib/diagnose.js' }
        },
      },
      '@pyreon/compiler/diagnose',
      DEV_ERROR_PRINTER_ID,
    )
    expect(out).toBe('/abs/compiler/lib/diagnose.js')
    expect(calls[0]?.id).toBe('@pyreon/compiler/diagnose')
    expect(calls[0]?.skipSelf).toBe(true)
  })

  it('does NOT plugin-resolve @pyreon/compiler/diagnose from an unrelated importer', async () => {
    // Only the printer virtual module gets the plugin-side resolution — a normal
    // app import of the same specifier is left to Vite's default resolution.
    const plugin = createPlugin()
    const hook = plugin.resolveId as unknown as (
      this: { resolve: () => Promise<{ id: string } | null> },
      id: string,
      importer?: string,
    ) => Promise<string | undefined>
    const out = await hook.call(
      { resolve: async () => ({ id: '/SHOULD_NOT_BE_RETURNED' }) },
      '@pyreon/compiler/diagnose',
      '/some/app/component.tsx',
    )
    expect(out).not.toBe('/SHOULD_NOT_BE_RETURNED')
  })
})

describe('transformIndexHtml injection (dev-only)', () => {
  it('injects the printer script in DEV (command=serve)', () => {
    const out = callTransformIndexHtml(createPlugin(undefined, 'serve'), HTML)
    expect(out).toContain(DEV_ERROR_PRINTER_SCRIPT_TAG)
    expect(out).toContain('</head>')
  })

  it('does NOT inject in a production build (command=build) — no compiler ships client-side', () => {
    const out = callTransformIndexHtml(createPlugin(undefined, 'build'), HTML)
    // Build returns undefined (no transform) OR at minimum never injects the tag.
    // (Assert on the URL substring, not DEV_ERROR_PRINTER_IMPORT — the src form
    // does not put the `virtual:` string in the HTML, so that check false-passes.)
    expect(out === undefined || !out.includes('dev-error-printer')).toBe(true)
  })

  it('does NOT inject when devErrorPrinter: false', () => {
    const out = callTransformIndexHtml(createPlugin({ devErrorPrinter: false }, 'serve'), HTML)
    expect(out === undefined || !out.includes('dev-error-printer')).toBe(true)
  })
})
