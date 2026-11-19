/** Resolving a relative import to the module it names — shared by the passes that read a sibling module. */
import { dirname, resolve } from 'node:path'

export const isRelative = (spec: string): boolean => spec === '.' || spec.startsWith('./') || spec.startsWith('../')

const MODULE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

/** The module `spec` names, relative to the file at `fromFile`, with its source; `undefined` when none is readable. */
export function resolveModule(fromFile: string, spec: string, readModule: (p: string) => string | undefined): { path: string; source: string } | undefined {
  const base = resolve(dirname(fromFile), spec)
  for (const candidate of [base, ...MODULE_EXTENSIONS.map((e) => base + e)]) {
    if (/\.(c|m)?[jt]sx?$/.test(candidate) || candidate !== base) {
      const source = readModule(candidate)
      if (source !== undefined) return { path: candidate, source }
    }
  }

  return undefined
}
