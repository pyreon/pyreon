import { gzipSync } from 'node:zlib'

// Local ambient — experiments tsconfig has no @types/bun; this script is
// a one-off reproducibility runner (the deliverable is RESULTS.md).
declare const Bun: { build: (o: unknown) => Promise<any> }

/** Deferrable mass: bundled gz of @pyreon/document's built entry, with
 *  the same externals as scripts/check-bundle-budgets.ts. This is the
 *  weight the resume/invoice ROUTE chunk eagerly ships today and that
 *  v2 auto-split would move to an on-export-click sub-chunk. */
const r = await Bun.build({
  entrypoints: ['packages/fundamentals/document/lib/index.js'],
  target: 'bun', minify: true, splitting: true,
  external: ['@pyreon/*','@tanstack/*','echarts','elkjs','codemirror','sharp','jszip','pdfmake','xlsx','pptxgenjs','node:*'],
})
if(!r.success){ console.log(JSON.stringify({error:String(r.logs?.[0])})); process.exit(0) }
let raw=0, gz=0
for (const o of r.outputs){ const t=await o.text(); raw+=t.length; gz+=gzipSync(t).length }
console.log(JSON.stringify({ entry:'@pyreon/document', chunks:r.outputs.length, rawBytes:raw, gzBytes:gz, gzKB:+(gz/1024).toFixed(1) }))
