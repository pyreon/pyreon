// `resolveJava` (runtime-kotlin/scripts/java-runtime.ts): the one JDK lookup every Kotlin behaviour check uses.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseJavaHome } from '../../../runtime-kotlin/scripts/java-runtime'

const RESOLVER = join(__dirname, '../../../runtime-kotlin/scripts/java-runtime.ts')

describe('java-runtime', () => {
  it('reads java.home to the end of the line — a JDK path may contain spaces', () => {
    const settings = [
      'Property settings:',
      '    file.encoding = UTF-8',
      '    java.home = /Applications/Android Studio.app/Contents/jbr/Contents/Home',
      '    java.version = 21.0.3',
    ].join('\n')
    expect(parseJavaHome(settings)).toBe('/Applications/Android Studio.app/Contents/jbr/Contents/Home')
    expect(parseJavaHome('    java.home = C:\\Program Files\\Java\\jdk-21  \r\n')).toBe('C:\\Program Files\\Java\\jdk-21')
    expect(parseJavaHome('no settings here')).toBeUndefined()
  })

  it('a pinned PYREON_JAVA is the answer, and an empty one means "no JDK" (no search, no JVM started)', () => {
    const run = (value: string): string =>
      spawnSync(process.execPath, ['-e', `import('${RESOLVER}').then((m) => console.log(String(m.resolveJava())))`], {
        encoding: 'utf8',
        env: { ...process.env, PYREON_JAVA: value },
      }).stdout.trim()
    expect(run('')).toBe('null')
    expect(run('/nonexistent/bin/java')).toBe('null')
  })
})
