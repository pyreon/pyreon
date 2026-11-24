// @vitest-environment node
// Every Android WebView the runtime creates handles the renderer's death.
//
// All WebViews of an app share one renderer process. When it dies, WebView
// calls `onRenderProcessGone` on each of them, and if ANY one answers false
// (the `WebViewClient` default) it kills the whole app process. PR #4772 first
// handled it on the `<WebView>` host only; the throwaway view behind
// `window.open` (PyreonWebChromeAndroid.kt) had a plain WebViewClient and,
// after `window.open('about:blank')`, lived for the app's lifetime.
//
// So a WebView is constructed in exactly one place, `pyreonNewWebView`, which
// takes a `PyreonWebViewClientBase` (whose `onRenderProcessGone` is final and
// answers true), and no runtime code extends `WebViewClient` directly. The
// iOS host recovers from a terminated content process with the same policy.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../../../../', import.meta.url))
const packages = join(repo, 'packages')

/** The source with comments removed: comments name the patterns they forbid. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'build' || name === 'lib' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (name.endsWith('.kt') || name.endsWith('.java')) out.push(p)
  }

  return out
}

const runtime = sourceFiles(packages)
  .filter((p) => !p.includes('/tests/') && !p.includes('/androidTest/') && !p.includes('/test/'))
  .map((p) => ({ path: p.slice(repo.length), src: code(readFileSync(p, 'utf8')) }))

describe('Android WebViews survive a renderer loss', () => {
  it('finds the runtime WebView host', () => {
    // A moved file must not turn the rules below into a vacuous pass.
    expect(runtime.map((f) => f.path)).toContain(
      'packages/fundamentals/hooks/native/kotlin/com/pyreon/runtime/PyreonWebView.kt',
    )
  })

  it('constructs a WebView only in pyreonNewWebView', () => {
    const sites = runtime.flatMap((f) =>
      [...f.src.matchAll(/(?<![\w.])(?:android\.webkit\.)?WebView\s*\(/g)].map(() => f.path),
    )
    expect(sites).toEqual(['packages/fundamentals/hooks/native/kotlin/com/pyreon/runtime/PyreonWebView.kt'])
    const host = runtime.find((f) => f.path.endsWith('/PyreonWebView.kt'))!.src
    expect(host).toMatch(
      /fun pyreonNewWebView\(context: Context, client: PyreonWebViewClientBase\): WebView =\s*WebView\(context\)\.apply \{ webViewClient = client \}/,
    )
  })

  it('extends WebViewClient only through PyreonWebViewClientBase', () => {
    const direct = runtime
      .filter((f) => /:\s*(?:android\.webkit\.)?WebViewClient\s*\(\s*\)/.test(f.src))
      .map((f) => f.path)
    expect(direct).toEqual(['packages/fundamentals/hooks/native/kotlin/com/pyreon/runtime/PyreonWebView.kt'])
    const host = runtime.find((f) => f.path.endsWith('/PyreonWebView.kt'))!.src
    expect(host).toMatch(/internal abstract class PyreonWebViewClientBase : WebViewClient\(\)/)
    expect(host).toMatch(
      /final override fun onRenderProcessGone\(view: WebView, detail: RenderProcessGoneDetail\): Boolean \{\s*rendererGone\(view, detail\)\s*return true\s*\}/,
    )
    // Nothing assigns a client after construction, which could swap the base out.
    const assignments = runtime.flatMap((f) =>
      [...f.src.matchAll(/\bwebViewClient\s*=(?!=)/g)].map(() => f.path),
    )
    expect(assignments).toEqual(['packages/fundamentals/hooks/native/kotlin/com/pyreon/runtime/PyreonWebView.kt'])
  })

  it('leaves no other way to build a WebView or install a client', () => {
    const bypasses: Array<[RegExp, string]> = [
      [/\bsetWebViewClient\s*\(/, 'setWebViewClient('],
      [/\bWebViewClientCompat\b/, 'WebViewClientCompat'],
      [/import\s+android\.webkit\.WebView(?:Client)?\s+as\b/, 'an aliased WebView / WebViewClient import'],
      [/\bnew\s+(?:android\.webkit\.)?WebView\s*\(/, 'new WebView( (Java)'],
      [/\bextends\s+(?:android\.webkit\.)?WebViewClient\b/, 'extends WebViewClient (Java)'],
    ]
    const found = runtime.flatMap((f) => bypasses.filter(([re]) => re.test(f.src)).map(([, what]) => `${f.path}: ${what}`))
    expect(found).toEqual([])
  })

  it('the iOS host recovers from a terminated content process', () => {
    const swift = code(
      readFileSync(join(packages, 'fundamentals/hooks/native/swift/PyreonWebView.swift'), 'utf8'),
    )
    expect(swift).toMatch(/func webViewWebContentProcessDidTerminate\(_ webView: WKWebView\)/)
    expect(swift).toMatch(/pyreonWebViewRendererGone\(&lossHistory/)
  })
})
