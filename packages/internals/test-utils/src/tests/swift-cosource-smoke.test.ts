import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { runSwiftSmoke } from '../../../../../scripts/swift-cosource-smoke'

describe('Swift co-source smoke artifacts', () => {
  it('executes its own compiled binary even when another gate overlaps', () => {
    const binaries: string[] = []
    const outer = runSwiftSmoke(['outer.swift'], ['test.swift'], (command, args) => {
      if (command !== 'swiftc') return { status: 0, stdout: readFileSync(command, 'utf8') }
      const bin = args.at(-1)!
      binaries.push(bin)
      writeFileSync(bin, 'outer verdict')
      const inner = runSwiftSmoke(['inner.swift'], ['test.swift'], (innerCommand, innerArgs) => {
        if (innerCommand !== 'swiftc')
          return { status: 0, stdout: readFileSync(innerCommand, 'utf8') }
        const innerBin = innerArgs.at(-1)!
        binaries.push(innerBin)
        writeFileSync(innerBin, 'inner verdict')
        return { status: 0 }
      })
      expect(inner).toMatchObject({ phase: 'run', status: 0, stdout: 'inner verdict' })
      return { status: 0 }
    })
    expect(outer).toMatchObject({ phase: 'run', status: 0, stdout: 'outer verdict' })
    expect(binaries).toHaveLength(2)
    expect(binaries.every((bin) => !existsSync(dirname(bin)))).toBe(true)
  })

  it.each(['compile', 'run'] as const)('keeps a %s failure and removes its artifacts', (phase) => {
    let binary = ''
    const result = runSwiftSmoke(['source.swift'], ['test.swift'], (command, args) => {
      if (command === 'swiftc') binary = args.at(-1)!
      if ((command === 'swiftc') === (phase === 'compile')) {
        return { status: 7, stderr: 'fixture failed' }
      }
      writeFileSync(binary, 'compiled')
      return { status: 0 }
    })
    expect(result).toMatchObject({ phase, status: 7, stderr: 'fixture failed' })
    expect(existsSync(dirname(binary))).toBe(false)
  })

  it('removes artifacts when invoking the compiler throws', () => {
    let binary = ''
    expect(() =>
      runSwiftSmoke([], [], (_command, args) => {
        binary = args.at(-1)!
        writeFileSync(binary, 'partial output')
        throw new Error('fixture compiler unavailable')
      }),
    ).toThrow('fixture compiler unavailable')
    expect(existsSync(dirname(binary))).toBe(false)
  })
})
