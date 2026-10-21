// CLI for the ID-token parity vectors — see src/tests/native-vectors.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { VECTORS, generate, render, type Vectors } from '../src/tests/native-vectors'

if (!process.argv.includes('--render')) writeFileSync(VECTORS, `${JSON.stringify(await generate(), null, 2)}\n`)
render(JSON.parse(readFileSync(VECTORS, 'utf8')) as Vectors)
console.log('[gen-native-vectors] wrote vectors.json + embedded copies')
