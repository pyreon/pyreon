// Phase D4 (native readiness audit 2026-06) — validation contract
// tests for the create-multiplatform CLI. Catches the bug class
// scout-8 named: "no kebab-case validation, no existing-dir check."
//
// Bisect-verified: removing either validation function from main()
// makes the corresponding "rejects" test fail because the broken
// scaffold completes instead of throwing.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { suggestKebab, validateProjectName, validateTargetDir } from '../index'

describe('validateProjectName', () => {
  it('accepts the canonical shape', () => {
    expect(() => validateProjectName('my-app')).not.toThrow()
    expect(() => validateProjectName('a')).not.toThrow()  // single letter
    expect(() => validateProjectName('todo-list-2026')).not.toThrow()
  })

  it('rejects empty', () => {
    expect(() => validateProjectName('')).toThrow(/cannot be empty/)
  })

  it('rejects > 50 chars', () => {
    const tooLong = 'a' + 'b'.repeat(51)
    expect(() => validateProjectName(tooLong)).toThrow(/max 50/)
  })

  it('rejects leading digit (Xcode + Gradle constraint)', () => {
    expect(() => validateProjectName('1-app')).toThrow(
      /must start with a lowercase letter/,
    )
  })

  it('rejects leading uppercase', () => {
    expect(() => validateProjectName('MyApp')).toThrow(
      /must start with a lowercase letter/,
    )
  })

  it('rejects underscores (kebab-case only)', () => {
    expect(() => validateProjectName('my_app')).toThrow(/lowercase kebab-case/)
  })

  it('rejects trailing hyphen', () => {
    expect(() => validateProjectName('my-app-')).toThrow(/no trailing hyphen/)
  })

  it('rejects consecutive hyphens', () => {
    expect(() => validateProjectName('my--app')).toThrow(/consecutive hyphens/)
  })

  it('error message includes a suggestion', () => {
    let caught: Error | undefined
    try {
      validateProjectName('MyApp')
    } catch (err) {
      caught = err as Error
    }
    expect(caught).toBeDefined()
    // Should suggest "myapp" (lowercase + valid kebab).
    expect(caught?.message).toContain('myapp')
  })
})

describe('suggestKebab', () => {
  it('lowercases', () => {
    expect(suggestKebab('MyApp')).toBe('myapp')
  })

  it('replaces invalid chars with hyphens', () => {
    expect(suggestKebab('my_app 2026')).toBe('my-app-2026')
  })

  it('strips leading digits/non-letters', () => {
    expect(suggestKebab('1-app')).toBe('app')
    expect(suggestKebab('@scoped/pkg')).toBe('scoped-pkg')
  })

  it('collapses consecutive hyphens', () => {
    expect(suggestKebab('a---b')).toBe('a-b')
  })

  it('strips trailing hyphens', () => {
    expect(suggestKebab('a-b-')).toBe('a-b')
  })

  it('fallback when input has nothing usable', () => {
    expect(suggestKebab('!!!')).toBe('my-app')
    expect(suggestKebab('')).toBe('my-app')
    expect(suggestKebab('123')).toBe('my-app')
  })

  it('truncates to 50 chars', () => {
    const long = 'a'.repeat(100)
    expect(suggestKebab(long).length).toBeLessThanOrEqual(50)
  })
})

describe('validateTargetDir', () => {
  let tempBase: string

  beforeEach(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'create-multiplatform-d4-'))
  })

  afterEach(() => {
    rmSync(tempBase, { recursive: true, force: true })
  })

  it('accepts a nonexistent dir (writeScaffold mkdir-recursive handles it)', () => {
    const target = join(tempBase, 'does-not-exist-yet')
    expect(existsSync(target)).toBe(false)
    expect(() => validateTargetDir(target)).not.toThrow()
  })

  it('accepts an existing EMPTY dir', () => {
    const target = join(tempBase, 'empty')
    mkdirSync(target)
    expect(() => validateTargetDir(target)).not.toThrow()
  })

  it('accepts a dir containing only .git and .DS_Store (allowlist)', () => {
    const target = join(tempBase, 'fresh-git')
    mkdirSync(target)
    mkdirSync(join(target, '.git'))
    writeFileSync(join(target, '.DS_Store'), '')
    expect(() => validateTargetDir(target)).not.toThrow()
  })

  it('REJECTS a dir with user content (the load-bearing case)', () => {
    const target = join(tempBase, 'has-stuff')
    mkdirSync(target)
    writeFileSync(join(target, 'existing-file.txt'), 'content')
    expect(() => validateTargetDir(target)).toThrow(/already exists and is non-empty/)
  })

  it('error message names the offending entries', () => {
    const target = join(tempBase, 'multiple')
    mkdirSync(target)
    writeFileSync(join(target, 'README.md'), '')
    writeFileSync(join(target, 'package.json'), '')
    let caught: Error | undefined
    try {
      validateTargetDir(target)
    } catch (err) {
      caught = err as Error
    }
    expect(caught).toBeDefined()
    // Names at least one of the actual entries so the user knows
    // what's in the way.
    expect(caught?.message).toMatch(/README\.md|package\.json/)
  })

  it('error message suggests the fix', () => {
    const target = join(tempBase, 'has-stuff-2')
    mkdirSync(target)
    writeFileSync(join(target, 'x'), '')
    let caught: Error | undefined
    try {
      validateTargetDir(target)
    } catch (err) {
      caught = err as Error
    }
    expect(caught?.message).toMatch(/pick a new --dir|remove the existing contents/)
  })
})
