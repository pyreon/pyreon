// Regenerate the CHART_HOST / FLOW_HOST / CODE_HOST / RICHTEXT_HOST literals
// embedded in src/VizApp.tsx.
//
// They must be LOCAL const string literals in the App file (PMTC const-ref
// resolution inlines a local literal into `PyreonWebView(html:)`; an imported
// const stays an unresolved reference), so this rewrites the consts in place.
// Run after changing the host builders or their options.
//
//   bun scripts/gen-hosts.ts
//
// CHART_HOST uses the ECharts CDN; FLOW_HOST is self-contained. CODE_HOST /
// RICHTEXT_HOST reference the app-bundled editor globals (`window.CM` /
// `window.TT`) via `<script src="./assets/{cm,tt}.js">` — produce those assets
// with `bun scripts/gen-editors.ts` (see the App-file comment).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildChartHostHtml } from '@pyreon/charts/webview'
import { buildFlowHostHtml } from '@pyreon/flow/webview'
import { buildCodeHostHtml } from '@pyreon/code/webview'
import { buildRichTextHostHtml } from '@pyreon/rich-text/webview'

const appPath = join(import.meta.dir, '..', 'src', 'VizApp.tsx')
let src = readFileSync(appPath, 'utf8')
const chart = JSON.stringify(buildChartHostHtml())
const flow = JSON.stringify(buildFlowHostHtml())
const code = JSON.stringify(buildCodeHostHtml({ codemirrorSrc: './assets/cm.js' }))
const richtext = JSON.stringify(buildRichTextHostHtml({ tiptapSrc: './assets/tt.js' }))
src = src.replace(/const CHART_HOST = .*/, `const CHART_HOST = ${chart}`)
src = src.replace(/const FLOW_HOST = .*/, `const FLOW_HOST = ${flow}`)
src = src.replace(/const CODE_HOST = .*/, `const CODE_HOST = ${code}`)
src = src.replace(/const RICHTEXT_HOST = .*/, `const RICHTEXT_HOST = ${richtext}`)
writeFileSync(appPath, src)
console.log('[gen-hosts] regenerated CHART_HOST + FLOW_HOST + CODE_HOST + RICHTEXT_HOST in src/VizApp.tsx')
