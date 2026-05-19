import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'))

manifest.version = pkg.version

mkdirSync('dist', { recursive: true })
writeFileSync('dist/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
