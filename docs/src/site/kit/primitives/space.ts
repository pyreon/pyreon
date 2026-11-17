import { breakpoints, space, type SpaceKey } from '../../theme'

/** A theme breakpoint key (`xs` is the base, from 0px). */
export type Breakpoint = keyof typeof breakpoints

/**
 * One value, or one per breakpoint (`{ xs: 150, md: 250 }`): from each key's
 * width up, until the next key. The same shape the UI system's responsive
 * props take, so a primitive hands it on unchanged.
 */
export type Responsive<T> = T | Readonly<Partial<Record<Breakpoint, T>>>

/** Pixels for a space key, per breakpoint when the value is responsive. */
export function spacePx(value: Responsive<SpaceKey>): number | Partial<Record<Breakpoint, number>> {
  if (typeof value === 'number') return space[value]
  const out: Partial<Record<Breakpoint, number>> = {}
  for (const key of Object.keys(value) as Breakpoint[]) {
    const step = value[key]
    if (step !== undefined) out[key] = space[step]
  }

  return out
}

/** Element's horizontal alignment vocabulary (`block` stretches). */
export type AlignX = 'left' | 'center' | 'right' | 'spaceBetween' | 'spaceAround' | 'block'
/** Element's vertical alignment vocabulary (`block` stretches). */
export type AlignY = 'top' | 'center' | 'bottom' | 'spaceBetween' | 'spaceAround' | 'block'

/** Accessibility and identity attributes every primitive passes through to its element. */
export interface A11yProps {
  id?: string | undefined
  role?: string | undefined
  'aria-label'?: string | undefined
  'aria-labelledby'?: string | undefined
  'aria-hidden'?: 'true' | undefined
}
