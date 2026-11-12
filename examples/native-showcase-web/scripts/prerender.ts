// Writes the server-rendered app into dist/index.html (replacing <!--app-->).
// Run after `vite build` (client) and `vite build --ssr` (server entry).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const { render } = (await import(join(root, 'dist-server/entry-server.js'))) as {
  render: () => Promise<string>
}
const htmlPath = join(root, 'dist/index.html')
const html = readFileSync(htmlPath, 'utf8')
if (!html.includes('<!--app-->')) {
  throw new Error('[native-showcase-web] dist/index.html has no <!--app--> marker')
}
writeFileSync(htmlPath, html.replace('<!--app-->', await render()))
console.log('[native-showcase-web] prerendered dist/index.html')
