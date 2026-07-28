/**
 * Pseudo-localization — find truncation and hard-coded strings without
 * translating anything.
 *
 * The bug class: a layout that fits in English overflows in German or Finnish,
 * where the same label is routinely 30–40% longer. You normally discover that
 * after shipping a translation, which is the most expensive moment to discover
 * it. Pseudo-localization is the standard answer (Chrome, Windows, Firefox all
 * ship a variant): render EVERY string in an accented, expanded form so the
 * length and the coverage problems surface in the language you already read.
 *
 * Three things it makes visible at once:
 *
 *   1. TRUNCATION — the expansion pads to a realistic worst case, so a button
 *      that clips at 40% growth clips here too.
 *   2. UNTRANSLATED strings — anything NOT transformed is a string that never
 *      went through i18n. It stands out precisely because everything around it
 *      is accented.
 *   3. Readability under substitution — accented Latin stays legible, so a
 *      reviewer can still tell what the UI says while judging the layout.
 *
 * Pure, so the transform is testable without a DOM. The panel applies it.
 */

/** Accented look-alikes. Legible, and visibly not the original. */
const MAP: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ć', d: 'đ', e: 'é', f: 'ƒ', g: 'ǵ', h: 'ĥ', i: 'í', j: 'ĵ',
  k: 'ķ', l: 'ĺ', m: 'ḿ', n: 'ń', o: 'ó', p: 'ṕ', q: ' q', r: 'ŕ', s: 'ś', t: 'ţ',
  u: 'ú', v: 'ṽ', w: 'ẃ', x: 'ẋ', y: 'ý', z: 'ź',
  A: 'Á', B: 'Ɓ', C: 'Ć', D: 'Đ', E: 'É', F: 'Ƒ', G: 'Ǵ', H: 'Ĥ', I: 'Í', J: 'Ĵ',
  K: 'Ķ', L: 'Ĺ', M: 'Ḿ', N: 'Ń', O: 'Ó', P: 'Ṕ', Q: 'Q', R: 'Ŕ', S: 'Ś', T: 'Ţ',
  U: 'Ú', V: 'Ṽ', W: 'Ẃ', X: 'Ẋ', Y: 'Ý', Z: 'Ź',
}

/**
 * Padding character. A visible glyph rather than a space so the expansion
 * cannot be mistaken for incidental whitespace — and so a trimmed string still
 * shows its true length.
 */
const PAD = '·'

/**
 * Default expansion. 40% matches the long tail of German / Finnish growth over
 * English, which is the case worth designing against; 30% is the commonly-cited
 * average and would let real overflows through.
 */
export const DEFAULT_EXPANSION = 0.4

export interface PseudoOptions {
  /** Fractional length increase. `0.4` = 40% longer. */
  expansion?: number
  /** Wrap in brackets so the string's boundaries are unambiguous. */
  brackets?: boolean
}

/**
 * Transform one string.
 *
 * Interpolation placeholders are preserved verbatim — `{{name}}`, `{name}` and
 * `%s` pass through untouched. Accenting the inside of a placeholder would
 * break the substitution and turn a layout check into a crash, which is the
 * fastest way to get a useful tool switched off.
 */
export function pseudoLocalize(input: string, options: PseudoOptions = {}): string {
  if (input === '') return ''
  const expansion = options.expansion ?? DEFAULT_EXPANSION

  // Split on placeholders, keeping them as separators.
  const parts = input.split(/(\{\{[^}]*\}\}|\{[^}]*\}|%[sd])/g)
  let accented = ''
  for (const part of parts) {
    if (/^(\{\{.*\}\}|\{.*\}|%[sd])$/.test(part)) {
      accented += part
      continue
    }
    for (const ch of part) accented += MAP[ch] ?? ch
  }

  // Pad against the ORIGINAL visible length so the growth is proportional to
  // what a translator would actually expand — placeholders included, since a
  // substituted value takes space too.
  const padCount = Math.max(0, Math.round(input.length * expansion))
  const padded = accented + (padCount > 0 ? ` ${PAD.repeat(padCount)}` : '')
  return options.brackets === false ? padded : `[${padded}]`
}

/** True when a string looks like it has already been through the transform. */
export function isPseudoLocalized(value: string): boolean {
  return value.startsWith('[') && value.includes(PAD)
}

/**
 * Apply to every string value of a control-value bag.
 *
 * Non-strings pass through: a boolean control is not a translatable string, and
 * coercing one would change the component's behaviour rather than its text.
 */
export function pseudoLocalizeValues(
  values: Record<string, unknown>,
  options: PseudoOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    out[key] = typeof value === 'string' ? pseudoLocalize(value, options) : value
  }
  return out
}
