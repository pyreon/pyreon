// The named palettes — exported as DATA, in their own module so a chart host
// (which only needs the theme in scope) never bundles nine hex lists it does not
// read. `theme={{ palette: palettes.okabeIto }}` is the import that pulls them.

import { DARK_PALETTE, DEFAULT_PALETTE } from './palette'

/**
 * Named series palettes, exported as data so a theme picks one by reference:
 * `theme={{ palette: palettes.okabeIto }}`.
 *
 * `pyreon` is the default (see `DEFAULT_PALETTE`); `pyreonDark` is the same
 * hues lifted 8–12% for a dark ground. The rest are the classics developers
 * ask for by name: ECharts 6's tokens and the ECharts 5 / dark palettes,
 * Observable 10, Tableau 10, Okabe–Ito (colour-vision safe) and Tailwind's
 * 500 step for design systems built on it.
 */
export const palettes = {
  pyreon: DEFAULT_PALETTE,
  pyreonDark: DARK_PALETTE,
  echarts6: ['#5070dd', '#b6d634', '#505372', '#ff994d', '#0ca8df', '#ffd10a', '#fb628b', '#785db0', '#3fbe95'],
  echarts5: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'],
  echartsDark: ['#4992ff', '#7cffb2', '#fddd60', '#ff6e76', '#58d9f9', '#05c091', '#ff8a45', '#8d48e3', '#dd79ff'],
  observable10: ['#4269d0', '#efb118', '#ff725c', '#6cc5b0', '#3ca951', '#ff8ab7', '#a463f2', '#97bbf5', '#9c6b4e', '#9498a0'],
  tableau10: ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'],
  okabeIto: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#000000'],
  tailwind: ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'],
} as const satisfies Record<string, readonly string[]>
