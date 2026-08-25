import { describe, expect, it } from 'vitest'
import {
  AGP_MIN_GRADLE,
  cmpVersions,
  extractAgp,
  extractPinnedGradle,
  minGradleFor,
  usesKotlinOptionsDsl,
} from '../../../../../scripts/check-agp-gradle-lockstep'

/**
 * The gate is only worth having if its version comparison is right — a naive
 * string compare would rate "8.9" above "8.13", which is exactly the boundary
 * that broke (AGP 8.13 needs Gradle 8.13; the pin was 8.10.2).
 */
describe('cmpVersions', () => {
  it('compares numerically, not lexically', () => {
    expect(cmpVersions('8.9', '8.13')).toBe(-1)
    expect(cmpVersions('8.13', '8.9')).toBe(1)
    expect(cmpVersions('8.14.5', '8.13')).toBe(1)
  })

  it('treats missing trailing components as zero', () => {
    expect(cmpVersions('8.13', '8.13.0')).toBe(0)
    expect(cmpVersions('8.13.1', '8.13')).toBe(1)
  })

  it('is exact at the boundary that actually broke', () => {
    expect(cmpVersions('8.10.2', '8.13')).toBe(-1)
    expect(cmpVersions('8.14.5', '8.13')).toBe(1)
  })
})

describe('minGradleFor', () => {
  it('resolves by major.minor, ignoring the patch', () => {
    expect(minGradleFor('8.13.2')).toBe('8.13')
    expect(minGradleFor('8.7.0')).toBe('8.9')
  })

  it('returns null for an AGP with no row — a guess is worse than a failure', () => {
    expect(minGradleFor('9.0.0')).toBeNull()
    expect(minGradleFor('8.99.0')).toBeNull()
  })

  it('every row maps to a parseable version', () => {
    for (const [agp, gradle] of Object.entries(AGP_MIN_GRADLE)) {
      expect(agp, `AGP key ${agp}`).toMatch(/^\d+\.\d+$/)
      expect(gradle, `min gradle for ${agp}`).toMatch(/^\d+\.\d+(\.\d+)?$/)
    }
  })
})

describe('extraction', () => {
  it('reads the AGP version out of a root build.gradle.kts', () => {
    const src = `plugins {
    id("com.android.application") version "8.13.2" apply false
    kotlin("android") version "2.4.10" apply false
}`
    expect(extractAgp(src)).toBe('8.13.2')
  })

  it('returns null when no AGP plugin line is present', () => {
    expect(extractAgp('plugins { kotlin("jvm") version "2.4.10" }')).toBeNull()
  })

  it('reads GRADLE_VERSION out of the workflow', () => {
    expect(extractPinnedGradle("          GRADLE_VERSION: '8.14.5'\n")).toBe('8.14.5')
    expect(extractPinnedGradle('no pin here')).toBeNull()
  })
})

/**
 * The `kotlinOptions` half. Kotlin 2.4 made it a hard error, and it surfaced
 * only AFTER the Gradle pin was fixed — a second ~6-minute round trip on the
 * same PR, which is precisely what this catches in a second.
 */
describe('usesKotlinOptionsDsl', () => {
  it('detects a real configuration block', () => {
    expect(usesKotlinOptionsDsl('android {\n    kotlinOptions {\n        jvmTarget = "17"\n    }\n}')).toBe(true)
    expect(usesKotlinOptionsDsl('    kotlinOptions{')).toBe(true)
  })

  it('does NOT trip on the word inside a comment', () => {
    // The repo keeps an explanatory comment naming `kotlinOptions` right next
    // to the replacement block. A naive substring check would fail every file
    // that documents the migration — i.e. punish the fix.
    const s = `// Kotlin 2.4 turned the \`kotlinOptions\` DSL into a hard ERROR
kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}`
    expect(usesKotlinOptionsDsl(s)).toBe(false)
  })

  it('does not match a bare mention with no brace', () => {
    expect(usesKotlinOptionsDsl('val x = "kotlinOptions"')).toBe(false)
  })
})
