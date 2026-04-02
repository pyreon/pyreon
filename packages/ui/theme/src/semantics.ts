import type { ColorScale } from '@pyreon/ui-tokens'
import type { ModeValue, SemanticColors } from './types'

/** Create a mode-aware value. */
export function m<T>(light: T, dark: T): ModeValue<T> {
  return { light, dark }
}

/** Resolve a mode-aware value for the given mode. */
export function resolveMode<T>(value: T | ModeValue<T>, mode: 'light' | 'dark'): T {
  if (value !== null && typeof value === 'object' && 'light' in value && 'dark' in value) {
    return (value as ModeValue<T>)[mode]
  }
  return value as T
}

/** Build semantic color aliases from a color palette. */
export function buildSemantics(
  gray: ColorScale,
  primary: ColorScale,
): SemanticColors {
  return {
    bg: m(gray[50], gray[950]),
    bgSubtle: m(gray[100], gray[900]),
    bgMuted: m(gray[200], gray[800]),
    text: m(gray[900], gray[50]),
    textMuted: m(gray[500], gray[400]),
    textSubtle: m(gray[400], gray[500]),
    border: m(gray[200], gray[800]),
    borderMuted: m(gray[100], gray[900]),
    ring: m(primary[500], primary[400]),
  }
}
