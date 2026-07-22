// Regenerate the CHART_HOST / FLOW_HOST literals embedded in src/VizApp.tsx.
//
// They must be LOCAL const string literals in the App file (PMTC const-ref
// resolution inlines a local literal into `PyreonWebView(html:)`; an imported
// const stays an unresolved reference), so this rewrites the two consts in
// place. Run after changing the host builders or their options.
//
//   bun scripts/gen-hosts.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildChartHostHtml } from '@pyreon/charts/webview'
import { buildFlowHostHtml } from '@pyreon/flow/webview'

const appPath = join(import.meta.dir, '..', 'src', 'VizApp.tsx')
let src = readFileSync(appPath, 'utf8')
const chart = JSON.stringify(buildChartHostHtml())
const flow = JSON.stringify(buildFlowHostHtml())
src = src.replace(/const CHART_HOST = .*/, `const CHART_HOST = ${chart}`)
src = src.replace(/const FLOW_HOST = .*/, `const FLOW_HOST = ${flow}`)
writeFileSync(appPath, src)
console.log('[gen-hosts] regenerated CHART_HOST + FLOW_HOST in src/VizApp.tsx')
