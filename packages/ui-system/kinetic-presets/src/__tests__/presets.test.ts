import { describe, expect, it } from 'vitest'
import {
  backInDown,
  backInLeft,
  backInRight,
  backInUp,
  blurIn,
  blurInDown,
  blurInLeft,
  blurInRight,
  blurInUp,
  blurScale,
  bounceIn,
  bounceInDown,
  bounceInLeft,
  bounceInRight,
  bounceInUp,
  clipBottom,
  clipCenter,
  clipCircle,
  clipCorner,
  clipDiamond,
  clipLeft,
  clipRight,
  clipTop,
  drop,
  expandX,
  expandY,
  fade,
  fadeDown,
  fadeDownBig,
  fadeDownLeft,
  fadeDownRight,
  fadeLeft,
  fadeLeftBig,
  fadeRight,
  fadeRightBig,
  fadeScale,
  fadeUp,
  fadeUpBig,
  fadeUpLeft,
  fadeUpRight,
  flipDiagonal,
  flipDiagonalReverse,
  flipX,
  flipXReverse,
  flipY,
  flipYReverse,
  floatDown,
  floatLeft,
  floatRight,
  floatUp,
  flyInDown,
  flyInLeft,
  flyInRight,
  flyInUp,
  lightSpeedInLeft,
  lightSpeedInRight,
  newspaperIn,
  perspectiveDown,
  perspectiveLeft,
  perspectiveRight,
  perspectiveUp,
  popIn,
  presets,
  puffIn,
  puffOut,
  pushInLeft,
  pushInRight,
  rise,
  rollInLeft,
  rollInRight,
  rotateIn,
  rotateInDown,
  rotateInReverse,
  rotateInUp,
  rubberIn,
  scaleDown,
  scaleIn,
  scaleInDown,
  scaleInLeft,
  scaleInRight,
  scaleInUp,
  scaleOut,
  scaleRotateIn,
  scaleUp,
  skewIn,
  skewInReverse,
  skewInY,
  skewInYReverse,
  slideDown,
  slideDownBig,
  slideLeft,
  slideLeftBig,
  slideRight,
  slideRightBig,
  slideUp,
  slideUpBig,
  slitHorizontal,
  slitVertical,
  spinIn,
  spinInReverse,
  springIn,
  squishX,
  squishY,
  swingInBottom,
  swingInLeft,
  swingInRight,
  swingInTop,
  swirlIn,
  swirlInReverse,
  tiltInDown,
  tiltInLeft,
  tiltInRight,
  tiltInUp,
  zoomIn,
  zoomInDown,
  zoomInLeft,
  zoomInRight,
  zoomInUp,
  zoomOut,
  zoomOutDown,
  zoomOutLeft,
  zoomOutRight,
  zoomOutUp,
} from '../index'
import type { Preset } from '../types'

// ─── Helpers ────────────────────────────────────────────────────────

const assertPresetShape = (preset: Preset) => {
  expect(preset.enterStyle).toBeDefined()
  expect(preset.enterToStyle).toBeDefined()
  expect(preset.enterTransition).toBeDefined()
  expect(preset.leaveStyle).toBeDefined()
  expect(preset.leaveToStyle).toBeDefined()
  expect(preset.leaveTransition).toBeDefined()
}

const assertSymmetric = (preset: Preset) => {
  // In a symmetric preset, enterStyle === leaveToStyle and enterToStyle === leaveStyle
  expect(preset.enterStyle).toEqual(preset.leaveToStyle)
  expect(preset.enterToStyle).toEqual(preset.leaveStyle)
}

// ─── Preset count ───────────────────────────────────────────────────

describe('presets — count', () => {
  it('exports 122 presets in the presets object', () => {
    expect(Object.keys(presets)).toHaveLength(122)
  })
})

// ─── All presets have correct shape ─────────────────────────────────

describe('presets — shape', () => {
  const allPresets = Object.entries(presets)

  it.each(allPresets)('%s has required style+transition fields', (_, preset) => {
    assertPresetShape(preset)
  })

  it.each(allPresets)('%s is symmetric (leave reverses enter)', (_, preset) => {
    assertSymmetric(preset)
  })

  it.each(allPresets)('%s has enter transition string', (_, preset) => {
    expect(preset.enterTransition).toMatch(/\d+m?s/)
  })

  it.each(allPresets)('%s has leave transition string', (_, preset) => {
    expect(preset.leaveTransition).toMatch(/\d+m?s/)
  })
})

// ─── Fades ──────────────────────────────────────────────────────────

describe('presets — fades', () => {
  it('fade is pure opacity', () => {
    expect(fade.enterStyle).toEqual({ opacity: 0 })
    expect(fade.enterToStyle).toEqual({ opacity: 1 })
  })

  it('fadeUp translates from 16px below', () => {
    expect(fadeUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(16px)',
    })
  })

  it('fadeDown translates from 16px above', () => {
    expect(fadeDown.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(-16px)',
    })
  })

  it('fadeLeft translates from 16px right', () => {
    expect(fadeLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(16px)',
    })
  })

  it('fadeRight translates from 16px left', () => {
    expect(fadeRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(-16px)',
    })
  })

  it('big variants use 48px distance', () => {
    expect(fadeUpBig.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(48px)',
    })
    expect(fadeDownBig.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(-48px)',
    })
    expect(fadeLeftBig.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(48px)',
    })
    expect(fadeRightBig.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(-48px)',
    })
  })

  it('fadeScale uses scale(0.95)', () => {
    expect(fadeScale.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.95)',
    })
  })
})

// ─── Slides ─────────────────────────────────────────────────────────

describe('presets — slides', () => {
  it('slideUp translates from 16px below', () => {
    expect(slideUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(16px)',
    })
  })

  it('slideDown translates from 16px above', () => {
    expect(slideDown.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(-16px)',
    })
  })

  it('slideLeft translates from 16px right', () => {
    expect(slideLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(16px)',
    })
  })

  it('slideRight translates from 16px left', () => {
    expect(slideRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(-16px)',
    })
  })

  it('big variants use 48px', () => {
    expect(slideUpBig.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(48px)',
    })
    expect(slideDownBig.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(-48px)',
    })
    expect(slideLeftBig.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(48px)',
    })
    expect(slideRightBig.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(-48px)',
    })
  })
})

// ─── Scales ─────────────────────────────────────────────────────────

describe('presets — scales', () => {
  it('scaleIn from 0.9', () => {
    expect(scaleIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.9)',
    })
  })

  it('scaleOut from 1.1', () => {
    expect(scaleOut.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(1.1)',
    })
  })

  it('scaleUp from 0.5 (dramatic)', () => {
    expect(scaleUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.5)',
    })
  })

  it('scaleDown from 1.5 (dramatic)', () => {
    expect(scaleDown.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(1.5)',
    })
  })

  it('directional scales combine scale + translate', () => {
    expect(scaleInUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.9) translateY(16px)',
    })
    expect(scaleInDown.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.9) translateY(-16px)',
    })
    expect(scaleInLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.9) translateX(16px)',
    })
    expect(scaleInRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.9) translateX(-16px)',
    })
  })
})

// ─── Zooms ──────────────────────────────────────────────────────────

describe('presets — zooms', () => {
  it('zoomIn starts at scale(0)', () => {
    expect(zoomIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0)',
    })
  })

  it('zoomOut starts at scale(2)', () => {
    expect(zoomOut.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(2)',
    })
  })

  it('directional zooms use 48px and scale(0.5)', () => {
    expect(zoomInUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.5) translateY(48px)',
    })
    expect(zoomInDown.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.5) translateY(-48px)',
    })
    expect(zoomInLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.5) translateX(48px)',
    })
    expect(zoomInRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.5) translateX(-48px)',
    })
  })

  it('zooms have longer duration (400ms)', () => {
    expect(zoomIn.enterTransition).toContain('400ms')
  })
})

// ─── Flips ──────────────────────────────────────────────────────────

describe('presets — flips', () => {
  it('flipX uses perspective + rotateX', () => {
    expect(flipX.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateX(90deg)',
    })
    expect(flipX.enterToStyle).toEqual({
      opacity: 1,
      transform: 'perspective(600px) rotateX(0)',
    })
  })

  it('flipY uses perspective + rotateY', () => {
    expect(flipY.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateY(90deg)',
    })
  })

  it('reverse variants use negative angles', () => {
    expect(flipXReverse.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateX(-90deg)',
    })
    expect(flipYReverse.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateY(-90deg)',
    })
  })
})

// ─── Rotations ──────────────────────────────────────────────────────

describe('presets — rotations', () => {
  it('rotateIn uses -15deg', () => {
    expect(rotateIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'rotate(-15deg)',
    })
  })

  it('rotateInReverse uses +15deg', () => {
    expect(rotateInReverse.enterStyle).toEqual({
      opacity: 0,
      transform: 'rotate(15deg)',
    })
  })

  it('directional rotations combine rotate + translate', () => {
    expect(rotateInUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'rotate(-5deg) translateY(16px)',
    })
    expect(rotateInDown.enterStyle).toEqual({
      opacity: 0,
      transform: 'rotate(5deg) translateY(-16px)',
    })
  })

  it('spins use 180deg', () => {
    expect(spinIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'rotate(-180deg)',
    })
    expect(spinInReverse.enterStyle).toEqual({
      opacity: 0,
      transform: 'rotate(180deg)',
    })
  })
})

// ─── Bounce / Spring ────────────────────────────────────────────────

describe('presets — bounce/spring', () => {
  it('bounceIn uses bounce easing', () => {
    expect(bounceIn.enterTransition).toContain('cubic-bezier(0.68, -0.55, 0.265, 1.55)')
  })

  it('all bounce variants use bounce easing', () => {
    const bouncePresets = [bounceIn, bounceInUp, bounceInDown, bounceInLeft, bounceInRight]
    for (const p of bouncePresets) {
      expect(p.enterTransition).toContain('cubic-bezier(0.68, -0.55, 0.265, 1.55)')
    }
  })

  it('springIn uses spring easing', () => {
    expect(springIn.enterTransition).toContain('cubic-bezier(0.34, 1.56, 0.64, 1)')
  })

  it('bounceIn scales from 0.5', () => {
    expect(bounceIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.5)',
    })
  })

  it('springIn scales from 0.8', () => {
    expect(springIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.8)',
    })
  })
})

// ─── Blur ───────────────────────────────────────────────────────────

describe('presets — blur', () => {
  it('blurIn uses filter: blur(8px)', () => {
    expect(blurIn.enterStyle).toEqual({
      opacity: 0,
      filter: 'blur(8px)',
    })
    expect(blurIn.enterToStyle).toEqual({
      opacity: 1,
      filter: 'blur(0px)',
    })
  })

  it('directional blurs combine blur + translate', () => {
    expect(blurInUp.enterStyle).toEqual({
      opacity: 0,
      filter: 'blur(8px)',
      transform: 'translateY(16px)',
    })
    expect(blurInDown.enterStyle).toEqual({
      opacity: 0,
      filter: 'blur(8px)',
      transform: 'translateY(-16px)',
    })
  })

  it('blurScale combines blur + scale', () => {
    expect(blurScale.enterStyle).toEqual({
      opacity: 0,
      filter: 'blur(8px)',
      transform: 'scale(0.95)',
    })
  })
})

// ─── Clip Path ──────────────────────────────────────────────────────

describe('presets — clip path', () => {
  it('clipTop reveals from top', () => {
    expect(clipTop.enterStyle).toEqual({
      clipPath: 'inset(0 0 100% 0)',
    })
    expect(clipTop.enterToStyle).toEqual({
      clipPath: 'inset(0 0 0 0)',
    })
  })

  it('clipBottom reveals from bottom', () => {
    expect(clipBottom.enterStyle).toEqual({
      clipPath: 'inset(100% 0 0 0)',
    })
  })

  it('clipLeft reveals from left', () => {
    expect(clipLeft.enterStyle).toEqual({
      clipPath: 'inset(0 100% 0 0)',
    })
  })

  it('clipRight reveals from right', () => {
    expect(clipRight.enterStyle).toEqual({
      clipPath: 'inset(0 0 0 100%)',
    })
  })

  it('clip presets do NOT include opacity (pure reveal)', () => {
    const clips = [clipTop, clipBottom, clipLeft, clipRight]
    for (const c of clips) {
      expect(c.enterStyle).not.toHaveProperty('opacity')
    }
  })
})

// ─── Perspective ────────────────────────────────────────────────────

describe('presets — perspective', () => {
  it('perspectiveUp tilts from above', () => {
    expect(perspectiveUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateX(15deg)',
    })
  })

  it('perspectiveDown tilts from below', () => {
    expect(perspectiveDown.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateX(-15deg)',
    })
  })

  it('perspectiveLeft tilts from left', () => {
    expect(perspectiveLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateY(-15deg)',
    })
  })

  it('perspectiveRight tilts from right', () => {
    expect(perspectiveRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateY(15deg)',
    })
  })
})

// ─── Expand / Skew / Drop / Rise ────────────────────────────────────

describe('presets — expand', () => {
  it('expandX uses scaleX(0)', () => {
    expect(expandX.enterStyle).toEqual({
      opacity: 0,
      transform: 'scaleX(0)',
    })
  })

  it('expandY uses scaleY(0)', () => {
    expect(expandY.enterStyle).toEqual({
      opacity: 0,
      transform: 'scaleY(0)',
    })
  })
})

describe('presets — skew', () => {
  it('skewIn uses skewX(-5deg)', () => {
    expect(skewIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'skewX(-5deg)',
    })
  })

  it('skewInReverse uses skewX(5deg)', () => {
    expect(skewInReverse.enterStyle).toEqual({
      opacity: 0,
      transform: 'skewX(5deg)',
    })
  })
})

describe('presets — drop/rise', () => {
  it('drop uses translateY(-100%)', () => {
    expect(drop.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(-100%)',
    })
  })

  it('rise uses translateY(100%)', () => {
    expect(rise.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(100%)',
    })
  })
})

// ─── Diagonal fades ─────────────────────────────────────────────────

describe('presets — diagonal fades', () => {
  it('fadeUpLeft translates from 16px diagonal', () => {
    expect(fadeUpLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'translate(16px, 16px)',
    })
  })

  it('fadeUpRight translates from -16px x, 16px y', () => {
    expect(fadeUpRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'translate(-16px, 16px)',
    })
  })

  it('fadeDownLeft translates from 16px x, -16px y', () => {
    expect(fadeDownLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'translate(16px, -16px)',
    })
  })

  it('fadeDownRight translates from -16px diagonal', () => {
    expect(fadeDownRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'translate(-16px, -16px)',
    })
  })
})

// ─── Zoom out directional ───────────────────────────────────────────

describe('presets — zoom out directional', () => {
  it('zoomOutUp uses scale(2) + translateY', () => {
    expect(zoomOutUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(2) translateY(48px)',
    })
  })

  it('all zoom out variants have 400ms enter', () => {
    for (const p of [zoomOutUp, zoomOutDown, zoomOutLeft, zoomOutRight]) {
      expect(p.enterTransition).toContain('400ms')
    }
  })
})

// ─── Blur horizontal ────────────────────────────────────────────────

describe('presets — blur horizontal', () => {
  it('blurInLeft combines blur + translateX', () => {
    expect(blurInLeft.enterStyle).toEqual({
      opacity: 0,
      filter: 'blur(8px)',
      transform: 'translateX(16px)',
    })
  })

  it('blurInRight combines blur + translateX', () => {
    expect(blurInRight.enterStyle).toEqual({
      opacity: 0,
      filter: 'blur(8px)',
      transform: 'translateX(-16px)',
    })
  })
})

// ─── Skew Y ─────────────────────────────────────────────────────────

describe('presets — skew Y', () => {
  it('skewInY uses skewY(-5deg)', () => {
    expect(skewInY.enterStyle).toEqual({
      opacity: 0,
      transform: 'skewY(-5deg)',
    })
  })

  it('skewInYReverse uses skewY(5deg)', () => {
    expect(skewInYReverse.enterStyle).toEqual({
      opacity: 0,
      transform: 'skewY(5deg)',
    })
  })
})

// ─── Back ───────────────────────────────────────────────────────────

describe('presets — back', () => {
  it('backInUp uses scale(0.7) + large translate', () => {
    expect(backInUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.7) translateY(80px)',
    })
  })

  it('all back variants use 400ms enter', () => {
    for (const p of [backInUp, backInDown, backInLeft, backInRight]) {
      expect(p.enterTransition).toContain('400ms')
    }
  })
})

// ─── Light speed ────────────────────────────────────────────────────

describe('presets — light speed', () => {
  it('lightSpeedInLeft uses translateX + skewX', () => {
    expect(lightSpeedInLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(100%) skewX(-30deg)',
    })
  })

  it('lightSpeedInRight uses opposite direction', () => {
    expect(lightSpeedInRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(-100%) skewX(30deg)',
    })
  })
})

// ─── Roll ───────────────────────────────────────────────────────────

describe('presets — roll', () => {
  it('rollInLeft uses translateX + rotate', () => {
    expect(rollInLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(-100%) rotate(-120deg)',
    })
  })

  it('rollInRight uses opposite direction', () => {
    expect(rollInRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(100%) rotate(120deg)',
    })
  })
})

// ─── Clip path shapes ───────────────────────────────────────────────

describe('presets — clip path shapes', () => {
  it('clipCircle uses circle()', () => {
    expect(clipCircle.enterStyle).toEqual({
      clipPath: 'circle(0% at 50% 50%)',
    })
  })

  it('clipCenter uses inset from center', () => {
    expect(clipCenter.enterStyle).toEqual({
      clipPath: 'inset(50% 50% 50% 50%)',
    })
  })

  it('clipDiamond uses polygon', () => {
    expect(clipDiamond.enterStyle).toEqual({
      clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)',
    })
  })

  it('clipCorner expands from corner', () => {
    expect(clipCorner.enterStyle).toEqual({
      clipPath: 'polygon(0 0, 0 0, 0 0, 0 0)',
    })
  })

  it('shape clips do NOT include opacity', () => {
    for (const c of [clipCircle, clipCenter, clipDiamond, clipCorner]) {
      expect(c.enterStyle).not.toHaveProperty('opacity')
    }
  })
})

// ─── Puff ───────────────────────────────────────────────────────────

describe('presets — puff', () => {
  it('puffIn uses blur + scale(1.5)', () => {
    expect(puffIn.enterStyle).toEqual({
      opacity: 0,
      filter: 'blur(4px)',
      transform: 'scale(1.5)',
    })
  })

  it('puffOut uses blur + scale(0.5)', () => {
    expect(puffOut.enterStyle).toEqual({
      opacity: 0,
      filter: 'blur(4px)',
      transform: 'scale(0.5)',
    })
  })
})

// ─── Swing ──────────────────────────────────────────────────────────

describe('presets — swing', () => {
  it('swingInTop uses rotateX with transformOrigin top', () => {
    expect(swingInTop.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateX(-90deg)',
      transformOrigin: 'top',
    })
  })

  it('swingInLeft uses rotateY with transformOrigin left', () => {
    expect(swingInLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateY(90deg)',
      transformOrigin: 'left',
    })
  })

  it('all swing variants have 500ms enter', () => {
    for (const p of [swingInTop, swingInBottom, swingInLeft, swingInRight]) {
      expect(p.enterTransition).toContain('500ms')
    }
  })
})

// ─── Slit ───────────────────────────────────────────────────────────

describe('presets — slit', () => {
  it('slitHorizontal uses rotateY + scaleX', () => {
    expect(slitHorizontal.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateY(90deg) scaleX(0)',
    })
  })

  it('slitVertical uses rotateX + scaleY', () => {
    expect(slitVertical.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateX(90deg) scaleY(0)',
    })
  })
})

// ─── Swirl ──────────────────────────────────────────────────────────

describe('presets — swirl', () => {
  it('swirlIn uses -540deg rotation + scale(0)', () => {
    expect(swirlIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'rotate(-540deg) scale(0)',
    })
  })

  it('swirlInReverse uses +540deg', () => {
    expect(swirlInReverse.enterStyle).toEqual({
      opacity: 0,
      transform: 'rotate(540deg) scale(0)',
    })
  })
})

// ─── Flip diagonal ─────────────────────────────────────────────────

describe('presets — flip diagonal', () => {
  it('flipDiagonal uses rotate3d(1,1,0)', () => {
    expect(flipDiagonal.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotate3d(1, 1, 0, 90deg)',
    })
  })

  it('flipDiagonalReverse uses rotate3d(1,-1,0)', () => {
    expect(flipDiagonalReverse.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotate3d(1, -1, 0, 90deg)',
    })
  })
})

// ─── Tilt ───────────────────────────────────────────────────────────

describe('presets — tilt', () => {
  it('tiltInUp combines perspective rotateX + translateY', () => {
    expect(tiltInUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateX(15deg) translateY(24px)',
    })
  })

  it('tiltInDown combines perspective rotateX + negative translateY', () => {
    expect(tiltInDown.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateX(-15deg) translateY(-24px)',
    })
  })

  it('tiltInLeft combines perspective rotateY + translateX', () => {
    expect(tiltInLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateY(-15deg) translateX(24px)',
    })
  })

  it('tiltInRight combines perspective rotateY + negative translateX', () => {
    expect(tiltInRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'perspective(600px) rotateY(15deg) translateX(-24px)',
    })
  })
})

// ─── Fly ────────────────────────────────────────────────────────────

describe('presets — fly', () => {
  it('flyInUp uses 100vh', () => {
    expect(flyInUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(100vh)',
    })
  })

  it('flyInDown uses -100vh', () => {
    expect(flyInDown.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(-100vh)',
    })
  })

  it('flyInLeft uses 100vw', () => {
    expect(flyInLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(100vw)',
    })
  })

  it('flyInRight uses -100vw', () => {
    expect(flyInRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(-100vw)',
    })
  })
})

// ─── Pop / Rubber / Squish ──────────────────────────────────────────

describe('presets — pop/rubber/squish', () => {
  it('popIn uses spring easing + scale(0.3)', () => {
    expect(popIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0.3)',
    })
    expect(popIn.enterTransition).toContain('cubic-bezier(0.34, 1.56, 0.64, 1)')
  })

  it('rubberIn uses elastic easing', () => {
    expect(rubberIn.enterTransition).toContain('cubic-bezier(0.175, 0.885, 0.32, 1.275)')
  })

  it('squishX uses non-uniform scale', () => {
    expect(squishX.enterStyle).toEqual({
      opacity: 0,
      transform: 'scaleX(1.4) scaleY(0.6)',
    })
  })

  it('squishY uses non-uniform scale (inverted)', () => {
    expect(squishY.enterStyle).toEqual({
      opacity: 0,
      transform: 'scaleX(0.6) scaleY(1.4)',
    })
  })
})

// ─── Scale rotate / newspaper ───────────────────────────────────────

describe('presets — scaleRotate/newspaper', () => {
  it('scaleRotateIn uses scale(0) + rotate(-180deg)', () => {
    expect(scaleRotateIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0) rotate(-180deg)',
    })
  })

  it('newspaperIn uses scale(0) + rotate(-720deg)', () => {
    expect(newspaperIn.enterStyle).toEqual({
      opacity: 0,
      transform: 'scale(0) rotate(-720deg)',
    })
    expect(newspaperIn.enterTransition).toContain('700ms')
  })
})

// ─── Float ──────────────────────────────────────────────────────────

describe('presets — float', () => {
  it('floatUp uses premium easing + translateY + scale', () => {
    expect(floatUp.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateY(32px) scale(0.97)',
    })
    expect(floatUp.enterTransition).toContain('cubic-bezier(0.23, 1, 0.32, 1)')
  })

  it('all float variants use premium easing', () => {
    for (const p of [floatUp, floatDown, floatLeft, floatRight]) {
      expect(p.enterTransition).toContain('cubic-bezier(0.23, 1, 0.32, 1)')
    }
  })
})

// ─── Push ───────────────────────────────────────────────────────────

describe('presets — push', () => {
  it('pushInLeft uses translateX(-48px) + scale(0.9)', () => {
    expect(pushInLeft.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(-48px) scale(0.9)',
    })
  })

  it('pushInRight uses translateX(48px) + scale(0.9)', () => {
    expect(pushInRight.enterStyle).toEqual({
      opacity: 0,
      transform: 'translateX(48px) scale(0.9)',
    })
  })
})
