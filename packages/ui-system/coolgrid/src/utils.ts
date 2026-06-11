import { omit } from '@pyreon/ui-core'
import { CONTEXT_KEYS } from './constants'

/** Checks whether a value is a finite number. */
export const isNumber = (value: unknown): value is number => Number.isFinite(value)

/** Checks whether a value is a finite number greater than zero. */
export const hasValue = (value: unknown): boolean => isNumber(value) && value > 0

/**
 * A CSS-variables-mode value — a `var(…)`/`calc(…)` reference string produced
 * by the cssVariables theming mode (unistyle's `themeToCssVars` leaves /
 * rocketstyle's mode pairs). Grid math can't run JS arithmetic on these;
 * the styled helpers express the same split with native CSS `calc()`.
 */
export const isCssVarValue = (value: unknown): value is string =>
  typeof value === 'string' && (value.startsWith('var(') || value.startsWith('calc('))

/**
 * Determines if a column should be visible. A column is visible when its
 * size is undefined (auto) or a non-zero number. Size 0 hides the column.
 */
export const isVisible = (value: unknown): boolean =>
  (isNumber(value) && value !== 0) || value === undefined

/** Returns true when both size and columns are positive numbers, indicating an explicit width can be calculated. */
type HasWidth = (size: unknown, columns: unknown) => boolean
export const hasWidth: HasWidth = (size, columns) => !!(hasValue(size) && hasValue(columns))

/** Strips grid context keys from a props object so they are not forwarded to the DOM element. */
type OmitCtxKeys = (props?: Record<string, any>) => ReturnType<typeof omit>
export const omitCtxKeys: OmitCtxKeys = (props) => omit(props, CONTEXT_KEYS)
