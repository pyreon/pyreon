/**
 * Head package benchmark — measures throughput for SSR head serialization.
 *
 * Compares:
 *   - @pyreon/head  — Pyreon's head manager (cached resolve, single-pass esc)
 *   - unhead        — Vue/Nuxt head manager (used by Nuxt, Analog, Inertia)
 *
 * Tests at 5, 20, and 50 meta tag counts:
 *   - resolve()           — context resolution (Pyreon only, shows cache benefit)
 *   - renderWithHead()    — full SSR pipeline including renderToString
 *   - renderSSRHead()     — head-only serialization (both frameworks)
 *
 * Usage: bun scripts/bench/core/head.ts
 */

import { createHead, renderSSRHead } from 'unhead/server'
import type { VNode } from '../../../packages/core/core/src/index'
import { h } from '../../../packages/core/core/src/index'
import type { HeadEntry, HeadTag } from '../../../packages/core/head/src/context'
import { createHeadContext } from '../../../packages/core/head/src/context'
import { renderWithHead } from '../../../packages/core/head/src/ssr'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeApp(): VNode {
  return h('div', null, h('h1', null, 'Benchmark'), h('p', null, 'Hello world'))
}

function makePyreonTags(count: number): HeadTag[] {
  const tags: HeadTag[] = [{ tag: 'title', key: 'title', children: 'Benchmark Page' }]
  for (let i = 0; i < count; i++) {
    tags.push({
      tag: 'meta',
      key: `meta-${i}`,
      props: {
        name: `description-${i}`,
        content: `Content for meta tag ${i} with <special> & "chars"`,
      },
    })
  }
  return tags
}

function makePyreonEntry(tagCount: number): HeadEntry {
  return {
    tags: makePyreonTags(tagCount),
    titleTemplate: '%s | Pyreon App',
    htmlAttrs: { lang: 'en', dir: 'ltr' },
    bodyAttrs: { class: 'dark' },
  }
}

function makeUnheadInput(count: number): { title: string; meta: Record<string, string>[] } {
  const meta: Record<string, string>[] = []
  for (let i = 0; i < count; i++) {
    meta.push({
      name: `description-${i}`,
      content: `Content for meta tag ${i} with <special> & "chars"`,
    })
  }
  return { title: 'Benchmark Page', meta }
}

// ─── Benchmark harness ───────────────────────────────────────────────────────

interface BenchResult {
  label: string
  opsPerSec: number
  avgNs: number
}

function bench(label: string, fn: () => void, durationMs = 2000): BenchResult {
  for (let i = 0; i < 1000; i++) fn()
  let ops = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    fn()
    ops++
  }
  const elapsed = performance.now() - start
  return {
    label,
    opsPerSec: Math.round((ops / elapsed) * 1000),
    avgNs: Math.round((elapsed / ops) * 1_000_000),
  }
}

async function benchAsync(
  label: string,
  fn: () => Promise<void>,
  durationMs = 2000,
): Promise<BenchResult> {
  for (let i = 0; i < 50; i++) await fn()
  let ops = 0
  const start = performance.now()
  const end = start + durationMs
  while (performance.now() < end) {
    await fn()
    ops++
  }
  const elapsed = performance.now() - start
  return {
    label,
    opsPerSec: Math.round((ops / elapsed) * 1000),
    avgNs: Math.round((elapsed / ops) * 1_000_000),
  }
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

function benchResolveCached(tagCount: number): BenchResult {
  const ctx = createHeadContext()
  ctx.add(Symbol(), makePyreonEntry(tagCount))
  ctx.resolve()
  return bench(`Pyreon resolve cached (${tagCount})`, () => {
    ctx.resolve()
    ctx.resolveTitleTemplate()
    ctx.resolveHtmlAttrs()
    ctx.resolveBodyAttrs()
  })
}

function benchResolveDirty(tagCount: number): BenchResult {
  const ctx = createHeadContext()
  return bench(`Pyreon resolve dirty (${tagCount})`, () => {
    const id = Symbol()
    ctx.add(id, makePyreonEntry(tagCount))
    ctx.resolve()
    ctx.resolveTitleTemplate()
    ctx.resolveHtmlAttrs()
    ctx.resolveBodyAttrs()
    ctx.remove(id)
  })
}

async function benchPyreonSSR(tagCount: number): Promise<BenchResult> {
  return benchAsync(`Pyreon renderWithHead (${tagCount})`, async () => {
    await renderWithHead(makeApp())
  })
}

async function benchUnheadSSR(tagCount: number): Promise<BenchResult> {
  const input = makeUnheadInput(tagCount)
  return benchAsync(`Unhead renderSSRHead (${tagCount})`, async () => {
    const head = createHead({ disableDefaults: true })
    head.push(input)
    await renderSSRHead(head)
  })
}

async function benchPyreonHeadOnly(tagCount: number): Promise<BenchResult> {
  return benchAsync(`Pyreon head serialize (${tagCount})`, async () => {
    const ctx = createHeadContext()
    ctx.add(Symbol(), makePyreonEntry(tagCount))
    ctx.resolve()
    ctx.resolveTitleTemplate()
  })
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('Head Package Benchmark (Bun)')
console.log('Pyreon vs Unhead (Vue/Nuxt)')
console.log(`${'='.repeat(70)}\n`)

const tagCounts = [5, 20, 50]

// Section 1: Pyreon resolve (cached vs dirty)
console.log('── Pyreon Context Resolve ──────────────────────────────────────────')
console.log(`${'test'.padEnd(36)}${'ops/sec'.padStart(14)}${'avg ns/op'.padStart(14)}`)
console.log('-'.repeat(64))

for (const count of tagCounts) {
  for (const r of [benchResolveCached(count), benchResolveDirty(count)]) {
    console.log(
      `${r.label.padEnd(36)}${r.opsPerSec.toLocaleString().padStart(14)}${r.avgNs.toLocaleString().padStart(14)}`,
    )
  }
}

// Section 2: Head-only SSR serialization (both)
console.log('\n── Head SSR Serialization (head-only, no app render) ─────────────')
console.log(`${'test'.padEnd(36)}${'ops/sec'.padStart(14)}${'avg ns/op'.padStart(14)}`)
console.log('-'.repeat(64))

for (const count of tagCounts) {
  const pyreon = await benchPyreonHeadOnly(count)
  const unhead = await benchUnheadSSR(count)
  for (const r of [pyreon, unhead]) {
    console.log(
      `${r.label.padEnd(36)}${r.opsPerSec.toLocaleString().padStart(14)}${r.avgNs.toLocaleString().padStart(14)}`,
    )
  }
}

// Section 3: Full renderWithHead (Pyreon only — includes renderToString)
console.log('\n── Full SSR (renderToString + head) ────────────────────────────────')
console.log(`${'test'.padEnd(36)}${'ops/sec'.padStart(14)}${'avg ns/op'.padStart(14)}`)
console.log('-'.repeat(64))

for (const count of tagCounts) {
  const r = await benchPyreonSSR(count)
  console.log(
    `${r.label.padEnd(36)}${r.opsPerSec.toLocaleString().padStart(14)}${r.avgNs.toLocaleString().padStart(14)}`,
  )
}

console.log()
