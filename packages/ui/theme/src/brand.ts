import theme, { type Theme } from './theme'

/** The ten opacity steps every system colour carries, from one RGB triple. */
const ramp = (rgb: string) => ({
  base: `rgba(${rgb}, 1)`,
  900: `rgba(${rgb}, 0.9)`,
  800: `rgba(${rgb}, 0.8)`,
  700: `rgba(${rgb}, 0.7)`,
  600: `rgba(${rgb}, 0.6)`,
  500: `rgba(${rgb}, 0.5)`,
  400: `rgba(${rgb}, 0.4)`,
  300: `rgba(${rgb}, 0.3)`,
  200: `rgba(${rgb}, 0.2)`,
  100: `rgba(${rgb}, 0.1)`,
  50: `rgba(${rgb}, 0.05)`,
})

/**
 * The Pyreon brand theme: the default theme with the brand's colours, type and
 * radii. Pass it to `<PyreonUI theme={brandTheme}>` in place of `theme`.
 *
 * - Primary is ember `#FF5E1A` with ink text (`#0A0A0E`, 6.46:1). White on ember
 *   is 3.06:1 and fails AA, so every component reads `primary.contrast` for
 *   text on the fill instead of assuming white.
 * - Danger and success keep white text (4.83:1 and 5.02:1); warning and info
 *   take ink.
 * - Text in a brand colour follows the mode: `text` on the light page,
 *   `textDark` on the dark page (ember text is `#A8380A` / `#FF8A4C`).
 * - Fonts are Space Grotesk and JetBrains Mono. The theme names them; the app
 *   loads them (the stacks fall back to the system fonts).
 * - Radii are softer than the default theme's.
 *
 * Every opacity step is regenerated from the brand colour, so tints, hover
 * rings and borders match the fill. Every text pair passes 4.5:1 in both modes
 * (`tests/contrast.test.ts`).
 */
export const brandTheme: Theme = {
  ...theme,
  fontFamily: {
    base: "'Space Grotesk', ui-sans-serif, system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  },
  borderRadius: {
    ...theme.borderRadius,
    small: 6,
    base: 10,
    medium: 14,
    large: 18,
    xLarge: 22,
  },
  color: {
    ...theme.color,
    system: {
      ...theme.color.system,
      primary: {
        ...ramp('255, 94, 26'),
        text: '#A8380A',
        textDark: '#FF8A4C',
        contrast: '#0A0A0E',
        hover: '#FF7A3D',
      },
      error: {
        ...ramp('220, 38, 38'),
        text: '#B91C1C',
        textDark: '#F87171',
        contrast: '#FFFFFF',
        hover: '#B91C1C',
      },
      success: {
        ...ramp('21, 128, 61'),
        text: '#11692F',
        textDark: '#4ADE80',
        contrast: '#FFFFFF',
        hover: '#166534',
      },
      warning: {
        ...ramp('250, 204, 21'),
        text: '#8A5A00',
        textDark: '#FACC15',
        contrast: '#0A0A0E',
        hover: '#FDE047',
      },
      info: {
        ...ramp('34, 211, 238'),
        text: '#0A6E89',
        textDark: '#22D3EE',
        contrast: '#0A0A0E',
        hover: '#67E8F9',
      },
    },
  },
}
