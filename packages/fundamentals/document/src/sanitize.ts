/**
 * Shared sanitization utilities for document renderers.
 * Prevents XSS via CSS injection, XML injection, and javascript: protocol attacks.
 */

/**
 * Sanitize a CSS value — strips characters that could break out of a CSS property.
 * Blocks: semicolons, braces, angle brackets, quotes, backslashes, expressions.
 */
export function sanitizeCss(value: string | undefined): string {
  if (value == null) return ''
  // Remove anything that could break out of a CSS value
  return value
    .replace(/[;{}()<>\\'"]/g, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(/gi, '')
    .replace(/javascript\s*:/gi, '')
}

/**
 * Sanitize a color value — only allows hex colors, named colors, rgb/rgba, hsl/hsla.
 * Returns the value if valid, empty string if not.
 */
export function sanitizeColor(value: string | undefined): string {
  if (value == null) return ''
  const trimmed = value.trim()
  // Hex: #fff, #ffffff, #ffffffff
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed
  // Named colors (common subset)
  if (/^[a-zA-Z]{1,20}$/.test(trimmed)) return trimmed
  // rgb/rgba/hsl/hsla
  if (/^(rgb|hsl)a?\(\s*[\d.,\s%]+\)$/.test(trimmed)) return trimmed
  // transparent, inherit, currentColor
  if (/^(transparent|inherit|currentColor|initial|unset)$/i.test(trimmed)) return trimmed
  return ''
}

/**
 * Sanitize a color for XML attributes (DOCX/PPTX) — only hex without #.
 * Returns 6-char hex string or default.
 */
export function sanitizeXmlColor(value: string | undefined, fallback = '000000'): string {
  if (value == null) return fallback
  const hex = value.replace('#', '')
  if (/^[0-9a-fA-F]{3,8}$/.test(hex)) return hex
  return fallback
}

/**
 * Sanitize a URL — blocks javascript:, data: (except images), and vbscript: protocols.
 * Returns the URL if safe, empty string if not.
 */
export function sanitizeHref(url: string | undefined): string {
  if (url == null) return ''
  const trimmed = url.trim()
  // Block dangerous protocols
  const lower = trimmed.toLowerCase().replace(/\s/g, '')
  if (lower.startsWith('javascript:')) return ''
  if (lower.startsWith('vbscript:')) return ''
  if (lower.startsWith('data:') && !lower.startsWith('data:image/')) return ''
  return trimmed
}

/**
 * Sanitize an image src — allows http(s), data:image, and relative paths.
 * Blocks javascript:, vbscript:, and non-image data: URIs.
 */
export function sanitizeImageSrc(src: string | undefined): string {
  if (src == null) return ''
  const trimmed = src.trim()
  const lower = trimmed.toLowerCase().replace(/\s/g, '')
  if (lower.startsWith('javascript:')) return ''
  if (lower.startsWith('vbscript:')) return ''
  if (lower.startsWith('data:') && !lower.startsWith('data:image/')) return ''
  return trimmed
}

/**
 * Sanitize a style attribute value — validates it's safe CSS.
 */
export function sanitizeStyle(value: string | undefined): string {
  if (value == null) return ''
  return sanitizeCss(value)
}
