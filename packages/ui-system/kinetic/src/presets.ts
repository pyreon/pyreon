import type { ClassTransitionProps, StyleTransitionProps } from './types'

export type Preset = StyleTransitionProps & ClassTransitionProps

export const fade: Preset = {
  enterStyle: { opacity: 0 },
  enterToStyle: { opacity: 1 },
  enterTransition: 'opacity 300ms ease-out',
  leaveStyle: { opacity: 1 },
  leaveToStyle: { opacity: 0 },
  leaveTransition: 'opacity 200ms ease-in',
}

export const scaleIn: Preset = {
  enterStyle: { opacity: 0, transform: 'scale(0.95)' },
  enterToStyle: { opacity: 1, transform: 'scale(1)' },
  enterTransition: 'opacity 300ms ease-out, transform 300ms ease-out',
  leaveStyle: { opacity: 1, transform: 'scale(1)' },
  leaveToStyle: { opacity: 0, transform: 'scale(0.95)' },
  leaveTransition: 'opacity 200ms ease-in, transform 200ms ease-in',
}

export const slideUp: Preset = {
  enterStyle: { opacity: 0, transform: 'translateY(16px)' },
  enterToStyle: { opacity: 1, transform: 'translateY(0)' },
  enterTransition: 'opacity 300ms ease-out, transform 300ms ease-out',
  leaveStyle: { opacity: 1, transform: 'translateY(0)' },
  leaveToStyle: { opacity: 0, transform: 'translateY(16px)' },
  leaveTransition: 'opacity 200ms ease-in, transform 200ms ease-in',
}

export const slideDown: Preset = {
  enterStyle: { opacity: 0, transform: 'translateY(-16px)' },
  enterToStyle: { opacity: 1, transform: 'translateY(0)' },
  enterTransition: 'opacity 300ms ease-out, transform 300ms ease-out',
  leaveStyle: { opacity: 1, transform: 'translateY(0)' },
  leaveToStyle: { opacity: 0, transform: 'translateY(-16px)' },
  leaveTransition: 'opacity 200ms ease-in, transform 200ms ease-in',
}

export const slideLeft: Preset = {
  enterStyle: { opacity: 0, transform: 'translateX(16px)' },
  enterToStyle: { opacity: 1, transform: 'translateX(0)' },
  enterTransition: 'opacity 300ms ease-out, transform 300ms ease-out',
  leaveStyle: { opacity: 1, transform: 'translateX(0)' },
  leaveToStyle: { opacity: 0, transform: 'translateX(16px)' },
  leaveTransition: 'opacity 200ms ease-in, transform 200ms ease-in',
}

export const slideRight: Preset = {
  enterStyle: { opacity: 0, transform: 'translateX(-16px)' },
  enterToStyle: { opacity: 1, transform: 'translateX(0)' },
  enterTransition: 'opacity 300ms ease-out, transform 300ms ease-out',
  leaveStyle: { opacity: 1, transform: 'translateX(0)' },
  leaveToStyle: { opacity: 0, transform: 'translateX(-16px)' },
  leaveTransition: 'opacity 200ms ease-in, transform 200ms ease-in',
}

export const presets = {
  fade,
  scaleIn,
  slideUp,
  slideDown,
  slideLeft,
  slideRight,
} as const
