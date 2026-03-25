import type {
  BlurOptions,
  CSSProperties,
  Direction,
  FadeOptions,
  Preset,
  RotateOptions,
  ScaleOptions,
  SlideOptions,
} from "./types"

const directionToTranslate = (direction: Direction, distance: number): string => {
  switch (direction) {
    case "up":
      return `translateY(${distance}px)`
    case "down":
      return `translateY(${-distance}px)`
    case "left":
      return `translateX(${distance}px)`
    case "right":
      return `translateX(${-distance}px)`
  }
}

const directionToZero = (direction: Direction): string => {
  switch (direction) {
    case "up":
    case "down":
      return "translateY(0)"
    case "left":
    case "right":
      return "translateX(0)"
  }
}

export const createFade = ({
  direction,
  distance = 16,
  duration = 300,
  leaveDuration = 200,
  easing = "ease-out",
  leaveEasing = "ease-in",
}: FadeOptions = {}): Preset => {
  if (!direction) {
    return {
      enterStyle: { opacity: 0 },
      enterToStyle: { opacity: 1 },
      enterTransition: `all ${duration}ms ${easing}`,
      leaveStyle: { opacity: 1 },
      leaveToStyle: { opacity: 0 },
      leaveTransition: `all ${leaveDuration}ms ${leaveEasing}`,
    }
  }
  const translate = directionToTranslate(direction, distance)
  const zero = directionToZero(direction)
  return {
    enterStyle: { opacity: 0, transform: translate },
    enterToStyle: { opacity: 1, transform: zero },
    enterTransition: `all ${duration}ms ${easing}`,
    leaveStyle: { opacity: 1, transform: zero },
    leaveToStyle: { opacity: 0, transform: translate },
    leaveTransition: `all ${leaveDuration}ms ${leaveEasing}`,
  }
}

export const createSlide = ({
  direction = "up",
  distance = 16,
  duration = 300,
  leaveDuration = 200,
  easing = "ease-out",
  leaveEasing = "ease-in",
}: SlideOptions = {}): Preset => {
  const translate = directionToTranslate(direction, distance)
  const zero = directionToZero(direction)
  return {
    enterStyle: { opacity: 0, transform: translate },
    enterToStyle: { opacity: 1, transform: zero },
    enterTransition: `all ${duration}ms ${easing}`,
    leaveStyle: { opacity: 1, transform: zero },
    leaveToStyle: { opacity: 0, transform: translate },
    leaveTransition: `all ${leaveDuration}ms ${leaveEasing}`,
  }
}

export const createScale = ({
  from = 0.9,
  duration = 300,
  leaveDuration = 200,
  easing = "ease-out",
  leaveEasing = "ease-in",
}: ScaleOptions = {}): Preset => ({
  enterStyle: { opacity: 0, transform: `scale(${from})` },
  enterToStyle: { opacity: 1, transform: "scale(1)" },
  enterTransition: `all ${duration}ms ${easing}`,
  leaveStyle: { opacity: 1, transform: "scale(1)" },
  leaveToStyle: { opacity: 0, transform: `scale(${from})` },
  leaveTransition: `all ${leaveDuration}ms ${leaveEasing}`,
})

export const createRotate = ({
  degrees = 15,
  duration = 300,
  leaveDuration = 200,
  easing = "ease-out",
  leaveEasing = "ease-in",
}: RotateOptions = {}): Preset => ({
  enterStyle: { opacity: 0, transform: `rotate(${-degrees}deg)` },
  enterToStyle: { opacity: 1, transform: "rotate(0)" },
  enterTransition: `all ${duration}ms ${easing}`,
  leaveStyle: { opacity: 1, transform: "rotate(0)" },
  leaveToStyle: { opacity: 0, transform: `rotate(${degrees}deg)` },
  leaveTransition: `all ${leaveDuration}ms ${leaveEasing}`,
})

export const createBlur = ({
  amount = 8,
  scale,
  duration = 300,
  leaveDuration = 200,
  easing = "ease-out",
  leaveEasing = "ease-in",
}: BlurOptions = {}): Preset => {
  const hidden: CSSProperties = { opacity: 0, filter: `blur(${amount}px)` }
  const visible: CSSProperties = { opacity: 1, filter: "blur(0px)" }
  if (scale !== undefined) {
    hidden.transform = `scale(${scale})`
    visible.transform = "scale(1)"
  }
  return {
    enterStyle: hidden,
    enterToStyle: visible,
    enterTransition: `all ${duration}ms ${easing}`,
    leaveStyle: visible,
    leaveToStyle: hidden,
    leaveTransition: `all ${leaveDuration}ms ${leaveEasing}`,
  }
}
