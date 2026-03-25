import type { CSSProperties, Preset } from "./types"

const s = (
  hidden: CSSProperties,
  visible: CSSProperties,
  enterDuration = "300ms",
  leaveDuration = "200ms",
  enterEasing = "ease-out",
  leaveEasing = "ease-in",
): Preset => ({
  enterStyle: hidden,
  enterToStyle: visible,
  enterTransition: `all ${enterDuration} ${enterEasing}`,
  leaveStyle: visible,
  leaveToStyle: hidden,
  leaveTransition: `all ${leaveDuration} ${leaveEasing}`,
})

const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)"
const BOUNCE = "cubic-bezier(0.68, -0.55, 0.265, 1.55)"

// Fades
export const fade: Preset = s({ opacity: 0 }, { opacity: 1 })
export const fadeUp: Preset = s(
  { opacity: 0, transform: "translateY(16px)" },
  { opacity: 1, transform: "translateY(0)" },
)
export const fadeDown: Preset = s(
  { opacity: 0, transform: "translateY(-16px)" },
  { opacity: 1, transform: "translateY(0)" },
)
export const fadeLeft: Preset = s(
  { opacity: 0, transform: "translateX(16px)" },
  { opacity: 1, transform: "translateX(0)" },
)
export const fadeRight: Preset = s(
  { opacity: 0, transform: "translateX(-16px)" },
  { opacity: 1, transform: "translateX(0)" },
)
export const fadeUpBig: Preset = s(
  { opacity: 0, transform: "translateY(48px)" },
  { opacity: 1, transform: "translateY(0)" },
)
export const fadeDownBig: Preset = s(
  { opacity: 0, transform: "translateY(-48px)" },
  { opacity: 1, transform: "translateY(0)" },
)
export const fadeLeftBig: Preset = s(
  { opacity: 0, transform: "translateX(48px)" },
  { opacity: 1, transform: "translateX(0)" },
)
export const fadeRightBig: Preset = s(
  { opacity: 0, transform: "translateX(-48px)" },
  { opacity: 1, transform: "translateX(0)" },
)
export const fadeScale: Preset = s(
  { opacity: 0, transform: "scale(0.95)" },
  { opacity: 1, transform: "scale(1)" },
)
export const fadeUpLeft: Preset = s(
  { opacity: 0, transform: "translate(16px, 16px)" },
  { opacity: 1, transform: "translate(0, 0)" },
)
export const fadeUpRight: Preset = s(
  { opacity: 0, transform: "translate(-16px, 16px)" },
  { opacity: 1, transform: "translate(0, 0)" },
)
export const fadeDownLeft: Preset = s(
  { opacity: 0, transform: "translate(16px, -16px)" },
  { opacity: 1, transform: "translate(0, 0)" },
)
export const fadeDownRight: Preset = s(
  { opacity: 0, transform: "translate(-16px, -16px)" },
  { opacity: 1, transform: "translate(0, 0)" },
)

// Slides
export const slideUp: Preset = s(
  { opacity: 0, transform: "translateY(16px)" },
  { opacity: 1, transform: "translateY(0)" },
)
export const slideDown: Preset = s(
  { opacity: 0, transform: "translateY(-16px)" },
  { opacity: 1, transform: "translateY(0)" },
)
export const slideLeft: Preset = s(
  { opacity: 0, transform: "translateX(16px)" },
  { opacity: 1, transform: "translateX(0)" },
)
export const slideRight: Preset = s(
  { opacity: 0, transform: "translateX(-16px)" },
  { opacity: 1, transform: "translateX(0)" },
)
export const slideUpBig: Preset = s(
  { opacity: 0, transform: "translateY(48px)" },
  { opacity: 1, transform: "translateY(0)" },
)
export const slideDownBig: Preset = s(
  { opacity: 0, transform: "translateY(-48px)" },
  { opacity: 1, transform: "translateY(0)" },
)
export const slideLeftBig: Preset = s(
  { opacity: 0, transform: "translateX(48px)" },
  { opacity: 1, transform: "translateX(0)" },
)
export const slideRightBig: Preset = s(
  { opacity: 0, transform: "translateX(-48px)" },
  { opacity: 1, transform: "translateX(0)" },
)

// Scales
export const scaleIn: Preset = s(
  { opacity: 0, transform: "scale(0.9)" },
  { opacity: 1, transform: "scale(1)" },
)
export const scaleOut: Preset = s(
  { opacity: 0, transform: "scale(1.1)" },
  { opacity: 1, transform: "scale(1)" },
)
export const scaleUp: Preset = s(
  { opacity: 0, transform: "scale(0.5)" },
  { opacity: 1, transform: "scale(1)" },
)
export const scaleDown: Preset = s(
  { opacity: 0, transform: "scale(1.5)" },
  { opacity: 1, transform: "scale(1)" },
)
export const scaleInUp: Preset = s(
  { opacity: 0, transform: "scale(0.9) translateY(16px)" },
  { opacity: 1, transform: "scale(1) translateY(0)" },
)
export const scaleInDown: Preset = s(
  { opacity: 0, transform: "scale(0.9) translateY(-16px)" },
  { opacity: 1, transform: "scale(1) translateY(0)" },
)
export const scaleInLeft: Preset = s(
  { opacity: 0, transform: "scale(0.9) translateX(16px)" },
  { opacity: 1, transform: "scale(1) translateX(0)" },
)
export const scaleInRight: Preset = s(
  { opacity: 0, transform: "scale(0.9) translateX(-16px)" },
  { opacity: 1, transform: "scale(1) translateX(0)" },
)

// Zooms
export const zoomIn: Preset = s(
  { opacity: 0, transform: "scale(0)" },
  { opacity: 1, transform: "scale(1)" },
  "400ms",
  "250ms",
)
export const zoomOut: Preset = s(
  { opacity: 0, transform: "scale(2)" },
  { opacity: 1, transform: "scale(1)" },
  "400ms",
  "250ms",
)
export const zoomInUp: Preset = s(
  { opacity: 0, transform: "scale(0.5) translateY(48px)" },
  { opacity: 1, transform: "scale(1) translateY(0)" },
  "400ms",
  "250ms",
)
export const zoomInDown: Preset = s(
  { opacity: 0, transform: "scale(0.5) translateY(-48px)" },
  { opacity: 1, transform: "scale(1) translateY(0)" },
  "400ms",
  "250ms",
)
export const zoomInLeft: Preset = s(
  { opacity: 0, transform: "scale(0.5) translateX(48px)" },
  { opacity: 1, transform: "scale(1) translateX(0)" },
  "400ms",
  "250ms",
)
export const zoomInRight: Preset = s(
  { opacity: 0, transform: "scale(0.5) translateX(-48px)" },
  { opacity: 1, transform: "scale(1) translateX(0)" },
  "400ms",
  "250ms",
)
export const zoomOutUp: Preset = s(
  { opacity: 0, transform: "scale(2) translateY(48px)" },
  { opacity: 1, transform: "scale(1) translateY(0)" },
  "400ms",
  "250ms",
)
export const zoomOutDown: Preset = s(
  { opacity: 0, transform: "scale(2) translateY(-48px)" },
  { opacity: 1, transform: "scale(1) translateY(0)" },
  "400ms",
  "250ms",
)
export const zoomOutLeft: Preset = s(
  { opacity: 0, transform: "scale(2) translateX(48px)" },
  { opacity: 1, transform: "scale(1) translateX(0)" },
  "400ms",
  "250ms",
)
export const zoomOutRight: Preset = s(
  { opacity: 0, transform: "scale(2) translateX(-48px)" },
  { opacity: 1, transform: "scale(1) translateX(0)" },
  "400ms",
  "250ms",
)

// Flips
export const flipX: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateX(90deg)" },
  { opacity: 1, transform: "perspective(600px) rotateX(0)" },
  "500ms",
  "300ms",
)
export const flipY: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateY(90deg)" },
  { opacity: 1, transform: "perspective(600px) rotateY(0)" },
  "500ms",
  "300ms",
)
export const flipXReverse: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateX(-90deg)" },
  { opacity: 1, transform: "perspective(600px) rotateX(0)" },
  "500ms",
  "300ms",
)
export const flipYReverse: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateY(-90deg)" },
  { opacity: 1, transform: "perspective(600px) rotateY(0)" },
  "500ms",
  "300ms",
)
export const flipDiagonal: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotate3d(1, 1, 0, 90deg)" },
  { opacity: 1, transform: "perspective(600px) rotate3d(1, 1, 0, 0deg)" },
  "500ms",
  "300ms",
)
export const flipDiagonalReverse: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotate3d(1, -1, 0, 90deg)" },
  { opacity: 1, transform: "perspective(600px) rotate3d(1, -1, 0, 0deg)" },
  "500ms",
  "300ms",
)

// Rotations
export const rotateIn: Preset = s(
  { opacity: 0, transform: "rotate(-15deg)" },
  { opacity: 1, transform: "rotate(0)" },
)
export const rotateInReverse: Preset = s(
  { opacity: 0, transform: "rotate(15deg)" },
  { opacity: 1, transform: "rotate(0)" },
)
export const rotateInUp: Preset = s(
  { opacity: 0, transform: "rotate(-5deg) translateY(16px)" },
  { opacity: 1, transform: "rotate(0) translateY(0)" },
)
export const rotateInDown: Preset = s(
  { opacity: 0, transform: "rotate(5deg) translateY(-16px)" },
  { opacity: 1, transform: "rotate(0) translateY(0)" },
)
export const spinIn: Preset = s(
  { opacity: 0, transform: "rotate(-180deg)" },
  { opacity: 1, transform: "rotate(0)" },
  "500ms",
  "300ms",
)
export const spinInReverse: Preset = s(
  { opacity: 0, transform: "rotate(180deg)" },
  { opacity: 1, transform: "rotate(0)" },
  "500ms",
  "300ms",
)
export const scaleRotateIn: Preset = s(
  { opacity: 0, transform: "scale(0) rotate(-180deg)" },
  { opacity: 1, transform: "scale(1) rotate(0)" },
  "500ms",
  "300ms",
)
export const newspaperIn: Preset = s(
  { opacity: 0, transform: "scale(0) rotate(-720deg)" },
  { opacity: 1, transform: "scale(1) rotate(0)" },
  "700ms",
  "400ms",
)

// Bounce / Spring
export const bounceIn: Preset = s(
  { opacity: 0, transform: "scale(0.5)" },
  { opacity: 1, transform: "scale(1)" },
  "500ms",
  "200ms",
  BOUNCE,
)
export const bounceInUp: Preset = s(
  { opacity: 0, transform: "translateY(40px)" },
  { opacity: 1, transform: "translateY(0)" },
  "500ms",
  "200ms",
  BOUNCE,
)
export const bounceInDown: Preset = s(
  { opacity: 0, transform: "translateY(-40px)" },
  { opacity: 1, transform: "translateY(0)" },
  "500ms",
  "200ms",
  BOUNCE,
)
export const bounceInLeft: Preset = s(
  { opacity: 0, transform: "translateX(40px)" },
  { opacity: 1, transform: "translateX(0)" },
  "500ms",
  "200ms",
  BOUNCE,
)
export const bounceInRight: Preset = s(
  { opacity: 0, transform: "translateX(-40px)" },
  { opacity: 1, transform: "translateX(0)" },
  "500ms",
  "200ms",
  BOUNCE,
)
export const springIn: Preset = s(
  { opacity: 0, transform: "scale(0.8)" },
  { opacity: 1, transform: "scale(1)" },
  "400ms",
  "200ms",
  SPRING,
)
export const popIn: Preset = s(
  { opacity: 0, transform: "scale(0.3)" },
  { opacity: 1, transform: "scale(1)" },
  "300ms",
  "200ms",
  SPRING,
)
export const rubberIn: Preset = s(
  { opacity: 0, transform: "scale(0.6)" },
  { opacity: 1, transform: "scale(1)" },
  "500ms",
  "250ms",
  "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
)
export const squishX: Preset = s(
  { opacity: 0, transform: "scaleX(1.4) scaleY(0.6)" },
  { opacity: 1, transform: "scaleX(1) scaleY(1)" },
  "400ms",
  "250ms",
  SPRING,
)
export const squishY: Preset = s(
  { opacity: 0, transform: "scaleX(0.6) scaleY(1.4)" },
  { opacity: 1, transform: "scaleX(1) scaleY(1)" },
  "400ms",
  "250ms",
  SPRING,
)

// Blur
export const blurIn: Preset = s(
  { opacity: 0, filter: "blur(8px)" },
  { opacity: 1, filter: "blur(0px)" },
)
export const blurInUp: Preset = s(
  { opacity: 0, filter: "blur(8px)", transform: "translateY(16px)" },
  { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
)
export const blurInDown: Preset = s(
  { opacity: 0, filter: "blur(8px)", transform: "translateY(-16px)" },
  { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
)
export const blurInLeft: Preset = s(
  { opacity: 0, filter: "blur(8px)", transform: "translateX(16px)" },
  { opacity: 1, filter: "blur(0px)", transform: "translateX(0)" },
)
export const blurInRight: Preset = s(
  { opacity: 0, filter: "blur(8px)", transform: "translateX(-16px)" },
  { opacity: 1, filter: "blur(0px)", transform: "translateX(0)" },
)
export const blurScale: Preset = s(
  { opacity: 0, filter: "blur(8px)", transform: "scale(0.95)" },
  { opacity: 1, filter: "blur(0px)", transform: "scale(1)" },
)

// Puff
export const puffIn: Preset = s(
  { opacity: 0, filter: "blur(4px)", transform: "scale(1.5)" },
  { opacity: 1, filter: "blur(0px)", transform: "scale(1)" },
  "400ms",
  "250ms",
)
export const puffOut: Preset = s(
  { opacity: 0, filter: "blur(4px)", transform: "scale(0.5)" },
  { opacity: 1, filter: "blur(0px)", transform: "scale(1)" },
  "400ms",
  "250ms",
)

// Clip Path
export const clipTop: Preset = s(
  { clipPath: "inset(0 0 100% 0)" },
  { clipPath: "inset(0 0 0 0)" },
  "400ms",
  "250ms",
)
export const clipBottom: Preset = s(
  { clipPath: "inset(100% 0 0 0)" },
  { clipPath: "inset(0 0 0 0)" },
  "400ms",
  "250ms",
)
export const clipLeft: Preset = s(
  { clipPath: "inset(0 100% 0 0)" },
  { clipPath: "inset(0 0 0 0)" },
  "400ms",
  "250ms",
)
export const clipRight: Preset = s(
  { clipPath: "inset(0 0 0 100%)" },
  { clipPath: "inset(0 0 0 0)" },
  "400ms",
  "250ms",
)
export const clipCircle: Preset = s(
  { clipPath: "circle(0% at 50% 50%)" },
  { clipPath: "circle(75% at 50% 50%)" },
  "500ms",
  "300ms",
)
export const clipCenter: Preset = s(
  { clipPath: "inset(50% 50% 50% 50%)" },
  { clipPath: "inset(0 0 0 0)" },
  "400ms",
  "250ms",
)
export const clipDiamond: Preset = s(
  { clipPath: "polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)" },
  { clipPath: "polygon(50% -10%, 110% 50%, 50% 110%, -10% 50%)" },
  "500ms",
  "300ms",
)
export const clipCorner: Preset = s(
  { clipPath: "polygon(0 0, 0 0, 0 0, 0 0)" },
  { clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" },
  "500ms",
  "300ms",
)

// Perspective
export const perspectiveUp: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateX(15deg)" },
  { opacity: 1, transform: "perspective(600px) rotateX(0)" },
)
export const perspectiveDown: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateX(-15deg)" },
  { opacity: 1, transform: "perspective(600px) rotateX(0)" },
)
export const perspectiveLeft: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateY(-15deg)" },
  { opacity: 1, transform: "perspective(600px) rotateY(0)" },
)
export const perspectiveRight: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateY(15deg)" },
  { opacity: 1, transform: "perspective(600px) rotateY(0)" },
)

// Expand
export const expandX: Preset = s(
  { opacity: 0, transform: "scaleX(0)" },
  { opacity: 1, transform: "scaleX(1)" },
)
export const expandY: Preset = s(
  { opacity: 0, transform: "scaleY(0)" },
  { opacity: 1, transform: "scaleY(1)" },
)

// Skew
export const skewIn: Preset = s(
  { opacity: 0, transform: "skewX(-5deg)" },
  { opacity: 1, transform: "skewX(0)" },
)
export const skewInReverse: Preset = s(
  { opacity: 0, transform: "skewX(5deg)" },
  { opacity: 1, transform: "skewX(0)" },
)
export const skewInY: Preset = s(
  { opacity: 0, transform: "skewY(-5deg)" },
  { opacity: 1, transform: "skewY(0)" },
)
export const skewInYReverse: Preset = s(
  { opacity: 0, transform: "skewY(5deg)" },
  { opacity: 1, transform: "skewY(0)" },
)

// Drop / Rise
export const drop: Preset = s(
  { opacity: 0, transform: "translateY(-100%)" },
  { opacity: 1, transform: "translateY(0)" },
  "400ms",
  "250ms",
)
export const rise: Preset = s(
  { opacity: 0, transform: "translateY(100%)" },
  { opacity: 1, transform: "translateY(0)" },
  "400ms",
  "250ms",
)

// Back
export const backInUp: Preset = s(
  { opacity: 0, transform: "scale(0.7) translateY(80px)" },
  { opacity: 1, transform: "scale(1) translateY(0)" },
  "400ms",
  "250ms",
)
export const backInDown: Preset = s(
  { opacity: 0, transform: "scale(0.7) translateY(-80px)" },
  { opacity: 1, transform: "scale(1) translateY(0)" },
  "400ms",
  "250ms",
)
export const backInLeft: Preset = s(
  { opacity: 0, transform: "scale(0.7) translateX(80px)" },
  { opacity: 1, transform: "scale(1) translateX(0)" },
  "400ms",
  "250ms",
)
export const backInRight: Preset = s(
  { opacity: 0, transform: "scale(0.7) translateX(-80px)" },
  { opacity: 1, transform: "scale(1) translateX(0)" },
  "400ms",
  "250ms",
)

// Light Speed
export const lightSpeedInLeft: Preset = s(
  { opacity: 0, transform: "translateX(100%) skewX(-30deg)" },
  { opacity: 1, transform: "translateX(0) skewX(0)" },
  "400ms",
  "250ms",
)
export const lightSpeedInRight: Preset = s(
  { opacity: 0, transform: "translateX(-100%) skewX(30deg)" },
  { opacity: 1, transform: "translateX(0) skewX(0)" },
  "400ms",
  "250ms",
)

// Roll
export const rollInLeft: Preset = s(
  { opacity: 0, transform: "translateX(-100%) rotate(-120deg)" },
  { opacity: 1, transform: "translateX(0) rotate(0)" },
  "500ms",
  "300ms",
)
export const rollInRight: Preset = s(
  { opacity: 0, transform: "translateX(100%) rotate(120deg)" },
  { opacity: 1, transform: "translateX(0) rotate(0)" },
  "500ms",
  "300ms",
)

// Swing
export const swingInTop: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateX(-90deg)", transformOrigin: "top" },
  { opacity: 1, transform: "perspective(600px) rotateX(0)", transformOrigin: "top" },
  "500ms",
  "300ms",
)
export const swingInBottom: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateX(90deg)", transformOrigin: "bottom" },
  { opacity: 1, transform: "perspective(600px) rotateX(0)", transformOrigin: "bottom" },
  "500ms",
  "300ms",
)
export const swingInLeft: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateY(90deg)", transformOrigin: "left" },
  { opacity: 1, transform: "perspective(600px) rotateY(0)", transformOrigin: "left" },
  "500ms",
  "300ms",
)
export const swingInRight: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateY(-90deg)", transformOrigin: "right" },
  { opacity: 1, transform: "perspective(600px) rotateY(0)", transformOrigin: "right" },
  "500ms",
  "300ms",
)

// Slit
export const slitHorizontal: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateY(90deg) scaleX(0)" },
  { opacity: 1, transform: "perspective(600px) rotateY(0) scaleX(1)" },
  "500ms",
  "300ms",
)
export const slitVertical: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateX(90deg) scaleY(0)" },
  { opacity: 1, transform: "perspective(600px) rotateX(0) scaleY(1)" },
  "500ms",
  "300ms",
)

// Swirl
export const swirlIn: Preset = s(
  { opacity: 0, transform: "rotate(-540deg) scale(0)" },
  { opacity: 1, transform: "rotate(0) scale(1)" },
  "600ms",
  "400ms",
)
export const swirlInReverse: Preset = s(
  { opacity: 0, transform: "rotate(540deg) scale(0)" },
  { opacity: 1, transform: "rotate(0) scale(1)" },
  "600ms",
  "400ms",
)

// Fly
export const flyInUp: Preset = s(
  { opacity: 0, transform: "translateY(100vh)" },
  { opacity: 1, transform: "translateY(0)" },
  "500ms",
  "300ms",
)
export const flyInDown: Preset = s(
  { opacity: 0, transform: "translateY(-100vh)" },
  { opacity: 1, transform: "translateY(0)" },
  "500ms",
  "300ms",
)
export const flyInLeft: Preset = s(
  { opacity: 0, transform: "translateX(100vw)" },
  { opacity: 1, transform: "translateX(0)" },
  "500ms",
  "300ms",
)
export const flyInRight: Preset = s(
  { opacity: 0, transform: "translateX(-100vw)" },
  { opacity: 1, transform: "translateX(0)" },
  "500ms",
  "300ms",
)

// Float
export const floatUp: Preset = s(
  { opacity: 0, transform: "translateY(32px) scale(0.97)" },
  { opacity: 1, transform: "translateY(0) scale(1)" },
  "500ms",
  "300ms",
  "cubic-bezier(0.23, 1, 0.32, 1)",
)
export const floatDown: Preset = s(
  { opacity: 0, transform: "translateY(-32px) scale(0.97)" },
  { opacity: 1, transform: "translateY(0) scale(1)" },
  "500ms",
  "300ms",
  "cubic-bezier(0.23, 1, 0.32, 1)",
)
export const floatLeft: Preset = s(
  { opacity: 0, transform: "translateX(32px) scale(0.97)" },
  { opacity: 1, transform: "translateX(0) scale(1)" },
  "500ms",
  "300ms",
  "cubic-bezier(0.23, 1, 0.32, 1)",
)
export const floatRight: Preset = s(
  { opacity: 0, transform: "translateX(-32px) scale(0.97)" },
  { opacity: 1, transform: "translateX(0) scale(1)" },
  "500ms",
  "300ms",
  "cubic-bezier(0.23, 1, 0.32, 1)",
)

// Push
export const pushInLeft: Preset = s(
  { opacity: 0, transform: "translateX(-48px) scale(0.9)" },
  { opacity: 1, transform: "translateX(0) scale(1)" },
)
export const pushInRight: Preset = s(
  { opacity: 0, transform: "translateX(48px) scale(0.9)" },
  { opacity: 1, transform: "translateX(0) scale(1)" },
)

// Tilt
export const tiltInUp: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateX(15deg) translateY(24px)" },
  { opacity: 1, transform: "perspective(600px) rotateX(0) translateY(0)" },
)
export const tiltInDown: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateX(-15deg) translateY(-24px)" },
  { opacity: 1, transform: "perspective(600px) rotateX(0) translateY(0)" },
)
export const tiltInLeft: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateY(-15deg) translateX(24px)" },
  { opacity: 1, transform: "perspective(600px) rotateY(0) translateX(0)" },
)
export const tiltInRight: Preset = s(
  { opacity: 0, transform: "perspective(600px) rotateY(15deg) translateX(-24px)" },
  { opacity: 1, transform: "perspective(600px) rotateY(0) translateX(0)" },
)

// All presets map
export const presets = {
  fade,
  fadeUp,
  fadeDown,
  fadeLeft,
  fadeRight,
  fadeUpBig,
  fadeDownBig,
  fadeLeftBig,
  fadeRightBig,
  fadeScale,
  fadeUpLeft,
  fadeUpRight,
  fadeDownLeft,
  fadeDownRight,
  slideUp,
  slideDown,
  slideLeft,
  slideRight,
  slideUpBig,
  slideDownBig,
  slideLeftBig,
  slideRightBig,
  scaleIn,
  scaleOut,
  scaleUp,
  scaleDown,
  scaleInUp,
  scaleInDown,
  scaleInLeft,
  scaleInRight,
  zoomIn,
  zoomOut,
  zoomInUp,
  zoomInDown,
  zoomInLeft,
  zoomInRight,
  zoomOutUp,
  zoomOutDown,
  zoomOutLeft,
  zoomOutRight,
  flipX,
  flipY,
  flipXReverse,
  flipYReverse,
  flipDiagonal,
  flipDiagonalReverse,
  rotateIn,
  rotateInReverse,
  rotateInUp,
  rotateInDown,
  spinIn,
  spinInReverse,
  scaleRotateIn,
  newspaperIn,
  bounceIn,
  bounceInUp,
  bounceInDown,
  bounceInLeft,
  bounceInRight,
  springIn,
  popIn,
  rubberIn,
  squishX,
  squishY,
  blurIn,
  blurInUp,
  blurInDown,
  blurInLeft,
  blurInRight,
  blurScale,
  puffIn,
  puffOut,
  clipTop,
  clipBottom,
  clipLeft,
  clipRight,
  clipCircle,
  clipCenter,
  clipDiamond,
  clipCorner,
  perspectiveUp,
  perspectiveDown,
  perspectiveLeft,
  perspectiveRight,
  expandX,
  expandY,
  skewIn,
  skewInReverse,
  skewInY,
  skewInYReverse,
  drop,
  rise,
  backInUp,
  backInDown,
  backInLeft,
  backInRight,
  lightSpeedInLeft,
  lightSpeedInRight,
  rollInLeft,
  rollInRight,
  swingInTop,
  swingInBottom,
  swingInLeft,
  swingInRight,
  slitHorizontal,
  slitVertical,
  swirlIn,
  swirlInReverse,
  flyInUp,
  flyInDown,
  flyInLeft,
  flyInRight,
  floatUp,
  floatDown,
  floatLeft,
  floatRight,
  pushInLeft,
  pushInRight,
  tiltInUp,
  tiltInDown,
  tiltInLeft,
  tiltInRight,
} as const
