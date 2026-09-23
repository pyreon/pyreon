// The native flow palettes are hand-written copies of the web's theme: the
// light values are the `var(--pyreon-flow-*, fallback)` defaults inline in the
// components, and the dark values are the `[data-color-mode="dark"]` block in
// styles.ts. Nothing tied the three together, so a web colour change left iOS
// and Android painting the old one. This reads all three from source and
// requires them to agree field by field, in both modes.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')

/** Native palette field -> the web CSS variable it mirrors. */
const FIELD_TO_VAR: Record<string, string> = {
  nodeBackground: 'node-bg',
  nodeColor: 'node-color',
  nodeBorder: 'node-border',
  nodeSelected: 'node-selected',
  edge: 'edge',
  edgeLabel: 'edge-label',
  accent: 'accent',
  handleBackground: 'handle-bg',
  handleBorder: 'handle-border',
  panelBackground: 'panel-bg',
  panelBorder: 'panel-border',
  controlColor: 'control-color',
  minimapNode: 'minimap-node',
  backgroundPattern: 'bg-pattern',
  resizerBackground: 'resizer-bg',
}

const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000' }

function normalize(color: string): string {
  const c = color.trim().toLowerCase()
  if (NAMED[c]) return NAMED[c]
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : c
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'tests' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

/** Every fallback written for each variable across the web components. */
function webLightFallbacks(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const file of sourceFiles(join(root, 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/var\(--pyreon-flow-([a-z-]+),\s*([^)]+)\)/g)) {
      const set = out.get(m[1]!) ?? new Set<string>()
      set.add(normalize(m[2]!))
      out.set(m[1]!, set)
    }
  }
  return out
}

/** The dark block the web applies under `colorMode="dark"`. */
function webDark(): { vars: Map<string, string>; canvas: string | null } {
  const css = readFileSync(join(root, 'src/styles.ts'), 'utf8')
  const start = css.indexOf('.pyreon-flow[data-color-mode="dark"] {')
  const block = css.slice(start, css.indexOf('}', start))
  const vars = new Map<string, string>()
  for (const m of block.matchAll(/--pyreon-flow-([a-z-]+):\s*([^;]+);/g)) vars.set(m[1]!, normalize(m[2]!))
  const canvas = /\n\s*background:\s*([^;]+);/.exec(block)?.[1]
  return { vars, canvas: canvas ? normalize(canvas) : null }
}

/** `light` / `dark` palette literals from a native source, as field -> value. */
function nativePalette(file: string, mode: 'light' | 'dark'): Map<string, string | null> {
  const src = readFileSync(join(root, file), 'utf8')
  const start = src.search(new RegExp(`(static let|val) ${mode} = PyreonFlowPalette\\(`))
  expect(start, `${file}: no ${mode} palette`).toBeGreaterThan(-1)
  const body = src.slice(start, src.indexOf(')', start))
  const out = new Map<string, string | null>()
  for (const m of body.matchAll(/(\w+)\s*[:=]\s*(nil|null|"[^"]*")/g)) {
    out.set(m[1]!, m[2] === 'nil' || m[2] === 'null' ? null : normalize(m[2]!.slice(1, -1)))
  }
  return out
}

const NATIVE = {
  swift: 'native/swift/PyreonFlowView.swift',
  kotlin: 'native/kotlin/com/pyreon/runtime/PyreonFlowView.kt',
} as const

describe('native flow palettes match the web theme', () => {
  const light = webLightFallbacks()
  const dark = webDark()

  it('the web writes ONE fallback per variable, so "the light value" is well defined', () => {
    for (const cssVar of Object.values(FIELD_TO_VAR)) {
      const values = light.get(cssVar)
      expect(values, `--pyreon-flow-${cssVar} has no fallback in any component`).toBeDefined()
      expect([...values!], `--pyreon-flow-${cssVar} has conflicting fallbacks`).toHaveLength(1)
    }
  })

  for (const [target, file] of Object.entries(NATIVE)) {
    it(`${target}: every light value is the web fallback`, () => {
      const palette = nativePalette(file, 'light')
      for (const [field, cssVar] of Object.entries(FIELD_TO_VAR)) {
        expect(palette.get(field), `${target} light.${field} vs --pyreon-flow-${cssVar}`).toBe([...light.get(cssVar)!][0])
      }
      // Light mode leaves the canvas transparent on web (no background rule).
      expect(palette.get('canvasBackground'), `${target} light.canvasBackground`).toBeNull()
    })

    it(`${target}: every dark value is the web dark block`, () => {
      const palette = nativePalette(file, 'dark')
      for (const [field, cssVar] of Object.entries(FIELD_TO_VAR)) {
        expect(palette.get(field), `${target} dark.${field} vs --pyreon-flow-${cssVar}`).toBe(dark.vars.get(cssVar))
      }
      expect(palette.get('canvasBackground'), `${target} dark.canvasBackground`).toBe(dark.canvas)
    })
  }

  it('covers every native palette field', () => {
    for (const file of Object.values(NATIVE)) {
      const fields = [...nativePalette(file, 'dark').keys()].filter((f) => f !== 'canvasBackground')
      expect(fields.sort(), file).toEqual(Object.keys(FIELD_TO_VAR).sort())
    }
  })
})
