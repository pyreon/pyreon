import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
for (const [target, file] of [
  ['Swift', 'generated/swift/VizApp.swift'],
  ['Kotlin', 'generated/kotlin/VizApp.kt'],
] as const) {
  const source = readFileSync(resolve(root, file), 'utf8')
  for (const required of [
    'PyreonWebView(',
    'pyreonFlowWebViewData(',
    'pyreonDispatchFlowWebViewMessage(',
    'initial-fit',
    'Flow error: ',
  ]) {
    if (!source.includes(required)) {
      throw new Error(`[check-native-output] ${target} output is missing ${JSON.stringify(required)}`)
    }
  }
  if (source.includes('FlowWebView(')) {
    throw new Error(`[check-native-output] ${target} retained an unresolved FlowWebView call`)
  }
}

console.log('[check-native-output] both targets contain the complete Flow WebView bridge')
