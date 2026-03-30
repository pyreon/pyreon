const PX_RE = /^(-?\d+(?:\.\d+)?)px$/;
const REM_RE = /^(-?\d+(?:\.\d+)?)rem$/;
const EM_RE = /^(-?\d+(?:\.\d+)?)em$/;
const PT_RE = /^(-?\d+(?:\.\d+)?)pt$/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

const DEFAULT_ROOT_SIZE = 16;

/**
 * Parse a CSS dimension value to a number.
 *
 * - `14` → `14`
 * - `'14px'` → `14`
 * - `'1.5rem'` → `24` (with rootSize=16)
 * - `'12pt'` → `16` (pt × 1.333)
 * - `'auto'` → `undefined`
 */
export function parseCssDimension(
  value: string | number | null | undefined,
  rootSize = DEFAULT_ROOT_SIZE,
): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();

  const pxMatch = PX_RE.exec(trimmed);
  if (pxMatch?.[1]) return Number.parseFloat(pxMatch[1]);

  const remMatch = REM_RE.exec(trimmed);
  if (remMatch?.[1]) return Number.parseFloat(remMatch[1]) * rootSize;

  const emMatch = EM_RE.exec(trimmed);
  if (emMatch?.[1]) return Number.parseFloat(emMatch[1]) * rootSize;

  const ptMatch = PT_RE.exec(trimmed);
  if (ptMatch?.[1]) return Number.parseFloat(ptMatch[1]) * (4 / 3);

  if (NUMBER_RE.test(trimmed)) return Number.parseFloat(trimmed);

  return undefined;
}

type BoxModelResult = number | [number, number] | [number, number, number, number] | undefined;

/**
 * Parse a CSS padding/margin shorthand to document tuple format.
 *
 * - `8` → `8`
 * - `'8px'` → `8`
 * - `'8px 16px'` → `[8, 16]`
 * - `'8px 16px 8px 16px'` → `[8, 16, 8, 16]`
 * - `'8px 16px 12px'` → `[8, 16, 12, 16]` (CSS 3-value shorthand)
 */
export function parseBoxModel(
  value: string | number | undefined,
  rootSize = DEFAULT_ROOT_SIZE,
): BoxModelResult {
  if (value == null) return undefined;
  if (typeof value === "number") return value;

  const parts = value
    .trim()
    .split(/\s+/)
    .map((p) => parseCssDimension(p, rootSize));

  const nums = parts.filter((p): p is number => p != null);
  if (nums.length !== parts.length) return undefined;

  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return [nums[0], nums[1]] as [number, number];
  if (nums.length === 3)
    return [nums[0], nums[1], nums[2], nums[1]] as [number, number, number, number];
  if (nums.length === 4)
    return [nums[0], nums[1], nums[2], nums[3]] as [number, number, number, number];

  return undefined;
}

/**
 * Parse a CSS font-weight value.
 */
export function parseFontWeight(
  value: string | number | undefined,
): "normal" | "bold" | number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  if (value === "normal" || value === "bold") return value;
  const num = Number.parseInt(value, 10);
  if (!Number.isNaN(num)) return num;
  return undefined;
}

/**
 * Parse a CSS line-height value to a unitless number.
 */
export function parseLineHeight(
  value: string | number | undefined,
  rootSize = DEFAULT_ROOT_SIZE,
): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  if (value === "normal") return undefined;

  const dim = parseCssDimension(value, rootSize);
  if (dim != null) return dim;

  return undefined;
}
