import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPresetName } from '../config/presets'
import type { PresetName } from '../types'

/**
 * The VS Code `pyreonLint.preset` setting must offer exactly the presets the
 * linter has (#4307: the enum listed four while the README listed five and the
 * linter had seven). `Record<PresetName, true>` makes typecheck fail when a
 * preset is added without being listed here.
 */
const ALL_PRESETS: Record<PresetName, true> = {
  recommended: true,
  strict: true,
  app: true,
  lib: true,
  'best-practices': true,
  readable: true,
  'readable-strict': true,
}

describe('VS Code preset setting', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../vscode/package.json'), 'utf8')) as {
    contributes: { configuration: { properties: Record<string, { enum?: string[]; default?: string }> } }
  }
  const setting = pkg.contributes.configuration.properties['pyreonLint.preset']

  it('offers every preset the linter knows, and nothing else', () => {
    expect([...(setting?.enum ?? [])].sort()).toEqual(Object.keys(ALL_PRESETS).sort())
    for (const name of setting?.enum ?? []) expect(isPresetName(name)).toBe(true)
  })

  it('defaults to a real preset', () => {
    expect(isPresetName(setting?.default)).toBe(true)
  })
})
